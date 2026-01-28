import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
  clusterApiUrl,
  Connection,
  Keypair,
  SendTransactionError,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { getHeliusRpcEndpoint } from "@/utils/helius";

export const runtime = "nodejs";

const DEFAULT_ADMIN_KEYPAIR =
  "zivoG6dyJgHp3tT2hTzKv6uahZ1JYj2vFUPC7UeHvBY.json";

type PlaceAndMatchPayload = {
  placeTx: string;
  matchTx: string;
};

const loadAdminKeypair = () => {
  if (process.env.ADMIN_MATCHER_KEYPAIR) {
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
  }
  const keypairPath =
    process.env.ORDERBOOK_ADMIN_KEYPAIR_PATH ||
    process.env.ADMIN_KEYPAIR_PATH ||
    path.resolve(process.cwd(), DEFAULT_ADMIN_KEYPAIR);
  if (!fs.existsSync(keypairPath)) {
    throw new Error(`admin keypair not found at ${keypairPath}`);
  }
  const secret = JSON.parse(fs.readFileSync(keypairPath, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
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

export async function POST(request: Request) {
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

    const placeTx = decodeTransaction(body.placeTx);
    const matchTx = decodeTransaction(body.matchTx);

    if (matchTx instanceof Transaction) {
      matchTx.partialSign(admin);
    } else {
      matchTx.sign([admin]);
    }

    const placeSignature = await connection.sendRawTransaction(
      serializeTransaction(placeTx),
      { skipPreflight: false },
    );
    await connection.confirmTransaction(placeSignature, "confirmed");

    const matchSignature = await connection.sendRawTransaction(
      serializeTransaction(matchTx),
      { skipPreflight: false },
    );
    await connection.confirmTransaction(matchSignature, "confirmed");

    return NextResponse.json({ placeSignature, matchSignature });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    const logs =
      err instanceof SendTransactionError ? err.getLogs() : undefined;
    console.error("place-and-match error", err);
    return NextResponse.json({ error: message, logs }, { status: 500 });
  }
}
