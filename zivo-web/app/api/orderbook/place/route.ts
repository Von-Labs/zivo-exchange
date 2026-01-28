import { NextResponse } from "next/server";
import {
  clusterApiUrl,
  Connection,
  SendTransactionError,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { getHeliusRpcEndpoint } from "@/utils/helius";

export const runtime = "nodejs";

type PlacePayload = {
  preTxs?: string[];
  placeTx: string;
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
      console.error("signature debug", describeSignatures(tx));
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
  try {
    const body = (await request.json()) as PlacePayload;
    if (!body?.placeTx) {
      return NextResponse.json({ error: "Missing placeTx" }, { status: 400 });
    }

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
    const placeTx = decodeTransaction(body.placeTx);
    placeTxDebug = placeTx;

    const preSignatures: string[] = [];
    for (const tx of preTxs) {
      preSignatures.push(await sendAndConfirm(connection, tx));
    }

    const placeSignature = await sendAndConfirm(connection, placeTx);

    return NextResponse.json({ preSignatures, placeSignature });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    const logs =
      err instanceof SendTransactionError ? err.getLogs() : undefined;
    console.error("place order error", err);
    const signatureDebug =
      err instanceof SendTransactionError && placeTxDebug
        ? describeSignatures(placeTxDebug)
        : undefined;
    return NextResponse.json(
      { error: message, logs, signatureDebug },
      { status: 500 },
    );
  }
}
