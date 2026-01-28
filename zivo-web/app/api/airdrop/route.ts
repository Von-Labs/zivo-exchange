import { NextRequest, NextResponse } from "next/server";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getMint,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
} from "@solana/spl-token";
import bs58 from "bs58";

const RATE_LIMIT_AMOUNT = 100;
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour

interface AirdropRecord {
  amount: number;
  timestamp: number;
}

// In-memory store (in production, use Redis or database)
const airdropRecords = new Map<string, AirdropRecord[]>();

function getAirdropHistory(walletAddress: string): AirdropRecord[] {
  return airdropRecords.get(walletAddress) || [];
}

function saveAirdropRecord(walletAddress: string, amount: number) {
  const records = getAirdropHistory(walletAddress);
  records.push({ amount, timestamp: Date.now() });
  airdropRecords.set(walletAddress, records);
}

function getRemainingAmount(walletAddress: string): number {
  const records = getAirdropHistory(walletAddress);
  const now = Date.now();
  const recentRecords = records.filter((r) => now - r.timestamp < RATE_LIMIT_WINDOW);
  const totalUsed = recentRecords.reduce((sum, r) => sum + r.amount, 0);
  return Math.max(0, RATE_LIMIT_AMOUNT - totalUsed);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { recipientAddress, tokenMint, amount } = body;

    // Validate inputs
    if (!recipientAddress || !tokenMint || !amount) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (amount <= 0 || amount > 100) {
      return NextResponse.json(
        { error: "Amount must be between 0 and 100" },
        { status: 400 }
      );
    }

    // Check rate limit
    const remaining = getRemainingAmount(recipientAddress);
    if (amount > remaining) {
      return NextResponse.json(
        { error: `Rate limit exceeded. You can only receive ${remaining} more tokens this hour.` },
        { status: 429 }
      );
    }

    // Get admin private key from environment
    const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY;
    if (!adminPrivateKey) {
      console.error("ADMIN_PRIVATE_KEY not configured");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Initialize connection - use devnet for development
    const rpcEndpoint = process.env.NEXT_PUBLIC_HELIUS_API_KEY
      ? `https://devnet.helius-rpc.com/?api-key=${process.env.NEXT_PUBLIC_HELIUS_API_KEY}`
      : "https://api.devnet.solana.com";
    const connection = new Connection(rpcEndpoint, "confirmed");

    // Initialize admin keypair
    const adminKeypair = Keypair.fromSecretKey(bs58.decode(adminPrivateKey));
    const recipientPubkey = new PublicKey(recipientAddress);
    const mintPubkey = new PublicKey(tokenMint);

    // Get mint info with better error handling
    let mintInfo;
    try {
      mintInfo = await getMint(connection, mintPubkey);
    } catch (err) {
      console.error("Failed to fetch mint info:", err);
      return NextResponse.json(
        { error: "Token mint not found. Make sure you're using the correct network (devnet)." },
        { status: 404 }
      );
    }

    // Check if admin is mint authority
    if (!mintInfo.mintAuthority || !mintInfo.mintAuthority.equals(adminKeypair.publicKey)) {
      return NextResponse.json(
        { error: "Server wallet is not the mint authority for this token" },
        { status: 403 }
      );
    }

    // Get or create recipient's associated token account
    const recipientAta = await getAssociatedTokenAddress(
      mintPubkey,
      recipientPubkey
    );

    // Check if ATA exists
    const accountInfo = await connection.getAccountInfo(recipientAta);
    const transaction = new Transaction();

    // Create ATA if it doesn't exist
    if (!accountInfo) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          adminKeypair.publicKey,
          recipientAta,
          recipientPubkey,
          mintPubkey,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }

    // Add mint instruction
    const mintAmount = amount * Math.pow(10, mintInfo.decimals);
    transaction.add(
      createMintToInstruction(
        mintPubkey,
        recipientAta,
        adminKeypair.publicKey,
        mintAmount
      )
    );

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = adminKeypair.publicKey;

    // Sign and send transaction
    transaction.sign(adminKeypair);
    const signature = await connection.sendRawTransaction(transaction.serialize());

    // Wait for confirmation
    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    });

    // Save airdrop record
    saveAirdropRecord(recipientAddress, amount);
    const newRemaining = getRemainingAmount(recipientAddress);

    return NextResponse.json({
      success: true,
      signature,
      message: `Successfully airdropped ${amount} tokens! You can receive ${newRemaining} more tokens in this hour.`,
      remaining: newRemaining,
    });
  } catch (error) {
    console.error("Airdrop error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Airdrop failed" },
      { status: 500 }
    );
  }
}
