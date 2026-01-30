import { NextResponse } from "next/server";
import {
  clusterApiUrl,
  Connection,
  Keypair,
  SendTransactionError,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { getHeliusRpcEndpoint } from "@/utils/helius";

export const runtime = "nodejs";

type PlaceAndMatchPayload = {
  preTxs?: string[];
  postTxs?: string[];
  placeTx: string;
  matchTx: string;
};

const loadAdminKeypair = () => {
  if (!process.env.ADMIN_MATCHER_KEYPAIR) {
    throw new Error("ADMIN_MATCHER_KEYPAIR is required");
  }
  try {
    const secret = JSON.parse(process.env.ADMIN_MATCHER_KEYPAIR) as number[];
    if (!Array.isArray(secret) || secret.length === 0) {
      throw new Error("ADMIN_MATCHER_KEYPAIR is empty");
    }
    return Keypair.fromSecretKey(Uint8Array.from(secret));
  } catch (err) {
    throw new Error(
      `ADMIN_MATCHER_KEYPAIR must be a JSON array of numbers: ${err instanceof Error ? err.message : "invalid value"}`,
    );
  }
};

const decodeTransaction = (payload: string) => {
  const buffer = Buffer.from(payload, "base64");
  try {
    return VersionedTransaction.deserialize(buffer);
  } catch {
    return Transaction.from(buffer);
  }
};

const serializeTransaction = (tx: Transaction | VersionedTransaction) =>
  tx.serialize();

const getTransactionSignature = (
  tx: Transaction | VersionedTransaction,
): string | null => {
  if (tx instanceof Transaction) {
    const entry = tx.signatures.find((sig) => sig.signature);
    return entry?.signature ? bs58.encode(entry.signature) : null;
  }
  const sig = tx.signatures?.[0];
  return sig ? bs58.encode(sig) : null;
};

const describeSignatures = (tx: Transaction | VersionedTransaction) => {
  if (tx instanceof Transaction) {
    const required = tx.signatures.map((sig) => sig.publicKey.toBase58());
    const missing = tx.signatures
      .filter((sig) => !sig.signature)
      .map((sig) => sig.publicKey.toBase58());
    return {
      type: "legacy",
      feePayer: tx.feePayer?.toBase58() ?? null,
      required,
      missing,
    };
  }

  const requiredKeys = tx.message.staticAccountKeys.slice(
    0,
    tx.message.header.numRequiredSignatures,
  );
  const required = requiredKeys.map((key) => key.toBase58());
  const missing = requiredKeys
    .map((key, index) => ({ key, sig: tx.signatures?.[index] }))
    .filter(({ sig }) => !sig || sig.length === 0)
    .map(({ key }) => key.toBase58());
  return {
    type: "v0",
    required,
    missing,
  };
};

const findInvalidSigners = (tx: Transaction | VersionedTransaction) => {
  if (tx instanceof Transaction) {
    const message = tx.serializeMessage();
    return tx.signatures
      .filter((sig) => sig.signature)
      .filter(
        (sig) =>
          !nacl.sign.detached.verify(
            message,
            sig.signature as Uint8Array,
            sig.publicKey.toBytes(),
          ),
      )
      .map((sig) => sig.publicKey.toBase58());
  }

  const message = tx.message.serialize();
  const requiredKeys = tx.message.staticAccountKeys.slice(
    0,
    tx.message.header.numRequiredSignatures,
  );
  return requiredKeys
    .map((key, index) => ({ key, sig: tx.signatures?.[index] }))
    .filter(({ sig }) => sig && sig.length > 0)
    .filter(
      ({ key, sig }) =>
        !nacl.sign.detached.verify(message, sig as Uint8Array, key.toBytes()),
    )
    .map(({ key }) => key.toBase58());
};

const getRequiredSigners = (tx: Transaction | VersionedTransaction) => {
  if (tx instanceof Transaction) {
    return tx.signatures.map((sig) => sig.publicKey.toBase58());
  }
  const requiredKeys = tx.message.staticAccountKeys.slice(
    0,
    tx.message.header.numRequiredSignatures,
  );
  return requiredKeys.map((key) => key.toBase58());
};

const maybeSignWithAdmin = (
  tx: Transaction | VersionedTransaction,
  admin: Keypair,
) => {
  const isZeroSignature = (sig?: Uint8Array | null) =>
    !sig || sig.length === 0 || sig.every((byte) => byte === 0);

  if (tx instanceof Transaction) {
    const entry = tx.signatures.find((sig) =>
      sig.publicKey.equals(admin.publicKey),
    );
    if (entry && isZeroSignature(entry.signature as Uint8Array | null)) {
      tx.partialSign(admin);
    }
    return;
  }

  const staticKeys = tx.message.staticAccountKeys;
  const requiredCount = tx.message.header.numRequiredSignatures;
  const requiredKeys = staticKeys.slice(0, requiredCount);
  const adminIndex = requiredKeys.findIndex((key) =>
    key.equals(admin.publicKey),
  );
  if (adminIndex === -1) return;

  const existingSig = tx.signatures?.[adminIndex];
  if (isZeroSignature(existingSig)) {
    tx.sign([admin]);
  }
};

const sendAndConfirm = async (
  connection: Connection,
  tx: Transaction | VersionedTransaction,
): Promise<string> => {
  try {
    const signature = await connection.sendRawTransaction(
      serializeTransaction(tx),
      { skipPreflight: false },
    );
    await connection.confirmTransaction(signature, "confirmed");
    return signature;
  } catch (err) {
    if (err instanceof SendTransactionError) {
      const logs = await err.getLogs();
      console.error("sendAndConfirm logs", logs);
    }
    const message = err instanceof Error ? err.message : "";
    if (message.includes("already been processed")) {
      const sig = getTransactionSignature(tx);
      if (sig) {
        return sig;
      }
    }
    throw err;
  }
};

export async function POST(request: Request) {
  let placeTxDebug: Transaction | VersionedTransaction | null = null;
  let matchTxDebug: Transaction | VersionedTransaction | null = null;
  try {
    const body = (await request.json()) as PlaceAndMatchPayload;
    if (!body?.placeTx || !body?.matchTx) {
      return NextResponse.json(
        { error: "Missing placeTx or matchTx" },
        { status: 400 },
      );
    }

    const admin = loadAdminKeypair();
    const rpcUrl = (() => {
      try {
        return getHeliusRpcEndpoint("devnet");
      } catch {
        return (
          process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl("devnet")
        );
      }
    })();
    const connection = new Connection(rpcUrl, "confirmed");

    const preTxs = (body.preTxs ?? []).map(decodeTransaction);
    const postTxs = (body.postTxs ?? []).map(decodeTransaction);
    const placeTx = decodeTransaction(body.placeTx);
    const matchTx = decodeTransaction(body.matchTx);
    placeTxDebug = placeTx;
    matchTxDebug = matchTx;

    for (const tx of preTxs) {
      maybeSignWithAdmin(tx, admin);
    }
    maybeSignWithAdmin(placeTx, admin);

    const matchRequired = getRequiredSigners(matchTx);
    const adminKey = admin.publicKey.toBase58();
    if (!matchRequired.includes(adminKey)) {
      return NextResponse.json(
        {
          error:
            "ADMIN_MATCHER_KEYPAIR does not match the matcher key required by the market.",
          required: matchRequired,
          admin: adminKey,
        },
        { status: 400 },
      );
    }
    maybeSignWithAdmin(matchTx, admin);

    const preSignatures: string[] = [];
    for (const tx of preTxs) {
      preSignatures.push(await sendAndConfirm(connection, tx));
    }

    const placeSignature = await sendAndConfirm(connection, placeTx);
    const matchSignature = await sendAndConfirm(connection, matchTx);

    const postSignatures: string[] = [];
    for (const tx of postTxs) {
      postSignatures.push(await sendAndConfirm(connection, tx));
    }

    return NextResponse.json({
      preSignatures,
      placeSignature,
      matchSignature,
      postSignatures,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    const logs =
      err instanceof SendTransactionError ? err.getLogs() : undefined;
    console.error("place-and-match error", err);
    const signatureDebug =
      err instanceof SendTransactionError && (placeTxDebug || matchTxDebug)
        ? {
            place: placeTxDebug ? describeSignatures(placeTxDebug) : null,
            match: matchTxDebug ? describeSignatures(matchTxDebug) : null,
            invalid: {
              place: placeTxDebug ? findInvalidSigners(placeTxDebug) : null,
              match: matchTxDebug ? findInvalidSigners(matchTxDebug) : null,
            },
          }
        : undefined;
    return NextResponse.json(
      { error: message, logs, signatureDebug },
      { status: 500 },
    );
  }
}
