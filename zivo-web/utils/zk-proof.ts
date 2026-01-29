/**
 * ZK Proof Generation Utilities for Browser Environment
 *
 * This module provides utilities for generating ZK proofs for shielded unwrap operations.
 * It uses circomlibjs for Poseidon hashing and prepares data for Noir circuit execution.
 *
 * Note: Full proof generation requires:
 * 1. Noir circuit compilation (done server-side or via WASM)
 * 2. Groth16 proof generation (Sunspot)
 * 3. Light Protocol merkle tree data
 */

import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import type { ShieldedPoolInputs } from "./commitment";

// Poseidon hash will be dynamically imported
let poseidonInstance: any = null;

/**
 * Initialize Poseidon hasher (circomlibjs)
 * Must be called before any hashing operations
 */
export async function initPoseidon(): Promise<void> {
  if (!poseidonInstance) {
    // Dynamically import circomlibjs
    const { buildPoseidon } = await import("circomlibjs");
    poseidonInstance = await buildPoseidon();
  }
}

/**
 * Get initialized Poseidon instance
 */
function getPoseidon(): any {
  if (!poseidonInstance) {
    throw new Error(
      "Poseidon not initialized. Call initPoseidon() first."
    );
  }
  return poseidonInstance;
}

/**
 * Hash multiple field elements using Poseidon
 */
export function poseidonHashFields(fields: (bigint | anchor.BN)[]): anchor.BN {
  const poseidon = getPoseidon();
  const inputs = fields.map((field) => {
    if (field instanceof anchor.BN) {
      return BigInt(field.toString());
    }
    return BigInt(field.toString());
  });
  const hash = poseidon(inputs);
  const hashValue = poseidon.F.toObject(hash) as bigint;
  return new anchor.BN(hashValue.toString());
}

/**
 * Hash two field elements using Poseidon (common operation)
 */
export function poseidonHash2(left: bigint | anchor.BN, right: bigint | anchor.BN): anchor.BN {
  return poseidonHashFields([left, right]);
}

/**
 * Convert BN to 32-byte hex string with 0x prefix
 */
export function bnToHex32(value: anchor.BN): string {
  const bytes = Buffer.from(value.toArray("be", 32));
  return `0x${bytes.toString("hex")}`;
}

/**
 * Generate random field element (31 bytes to stay within BN254 field)
 */
export function randomFieldBytes(): Uint8Array {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Convert Solana PublicKey to BN254 field element
 * Uses hash to ensure it fits within field size
 */
export function pubkeyToField(pubkey: PublicKey): anchor.BN {
  // Simple approach: take first 31 bytes of pubkey
  // In production, use proper hashvToBn254FieldSizeBe from @lightprotocol/stateless.js
  const bytes = pubkey.toBytes();
  const fieldBytes = bytes.slice(0, 31);
  return new anchor.BN(fieldBytes, "be");
}

/**
 * Build note commitment data structure
 *
 * Note structure (Poseidon hash):
 * commitment = H(H(owner, mint), H(amount, blinding))
 *
 * Returns all the fields needed for proof generation
 */
export interface NoteFields {
  ownerField: anchor.BN;
  mintField: anchor.BN;
  amountField: anchor.BN;
  blindingField: anchor.BN;
  noteHash: anchor.BN;
  commitmentBytes: Uint8Array;
}

export function buildNoteFields(
  owner: PublicKey,
  mint: PublicKey,
  amount: number | anchor.BN
): NoteFields {
  const ownerField = pubkeyToField(owner);
  const mintField = pubkeyToField(mint);
  const amountField =
    amount instanceof anchor.BN
      ? amount
      : new anchor.BN(amount.toString());
  const blindingField = new anchor.BN(randomFieldBytes());

  const ownerMint = poseidonHash2(ownerField, mintField);
  const amountBlinding = poseidonHash2(amountField, blindingField);
  const noteHash = poseidonHash2(ownerMint, amountBlinding);
  const commitmentBytes = new Uint8Array(noteHash.toArray("be", 32));

  return {
    ownerField,
    mintField,
    amountField,
    blindingField,
    noteHash,
    commitmentBytes,
  };
}

/**
 * Compute nullifier from note hash and secret
 * nullifier = H(noteHash, nullifierSecret)
 */
export function computeNullifier(
  noteHash: anchor.BN,
  nullifierSecret: anchor.BN
): anchor.BN {
  return poseidonHash2(noteHash, nullifierSecret);
}

/**
 * Generate random nullifier secret
 */
export function generateNullifierSecret(): anchor.BN {
  return new anchor.BN(randomFieldBytes());
}

/**
 * Prepare inputs for Noir circuit proof generation
 *
 * This function takes a commitment and prepares all the data needed
 * for the Noir circuit to generate a proof.
 *
 * Note: In production, this would also:
 * 1. Query Light Protocol state tree for merkle proof
 * 2. Call Noir prover (via API or WASM)
 * 3. Format proof for Solana verifier
 */
export async function prepareShieldedUnwrapInputs(params: {
  commitment: {
    zkData: {
      owner: string;
      mint: string;
      blinding: string;
      nullifierSecret: string;
      nullifier: string;
      commitmentHash: string;
      leaf?: string;
      leafIndex?: number;
      root?: string;
      siblings?: string[];
    };
    amount: string;
  };
  recipient: PublicKey;
}): Promise<ShieldedPoolInputs> {
  const { commitment, recipient } = params;
  const zkData = commitment.zkData;

  // Convert recipient to field element
  const recipientField = pubkeyToField(recipient);

  // Default merkle tree data (32-depth tree with empty siblings)
  // In production, fetch real data from Light Protocol
  const defaultSiblings = Array.from({ length: 32 }, () => "0x" + "00".repeat(32));

  return {
    root: zkData.root || "0x" + "00".repeat(32),
    nullifier: zkData.nullifier,
    recipient: bnToHex32(recipientField),
    amount: commitment.amount,
    mint: zkData.mint,
    commitment: zkData.commitmentHash,
    leaf: zkData.leaf || "0x" + "00".repeat(32),
    index: zkData.leafIndex?.toString() || "0",
    siblings: zkData.siblings || defaultSiblings,
    owner: zkData.owner,
    blinding: zkData.blinding,
    nullifier_secret: zkData.nullifierSecret,
  };
}

/**
 * Generate ZK proof via backend API
 *
 * Calls Next.js API route that executes:
 * 1. nargo execute - Generate witness from circuit
 * 2. sunspot prove - Generate Groth16 proof
 * 3. Returns proof bytes for Solana verifier
 */
export async function generateProof(
  inputs: ShieldedPoolInputs
): Promise<Buffer> {
  console.log("Generating ZK proof with inputs:", {
    root: inputs.root,
    nullifier: inputs.nullifier,
    recipient: inputs.recipient,
    amount: inputs.amount,
    commitment: inputs.commitment,
  });

  try {
    const response = await fetch("/api/generate-proof", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(inputs),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to generate proof");
    }

    const data = await response.json();

    if (!data.success || !data.proof) {
      throw new Error("Invalid proof response from server");
    }

    console.log("Proof generated successfully:", {
      proofSize: data.proofSize,
      publicWitnessSize: data.publicWitnessSize,
    });

    // Decode base64 proof to Buffer
    return Buffer.from(data.proof, "base64");
  } catch (error: any) {
    console.error("Proof generation failed:", error);
    throw new Error(
      `ZK proof generation failed: ${error.message}\n\n` +
      "Make sure:\n" +
      "1. nargo is installed and in PATH\n" +
      "2. sunspot is installed and in PATH\n" +
      "3. Noir circuit is compiled in ../zivo-wrap/noir_circuit/\n" +
      "4. GNARK_VERIFIER_BIN environment variable is set"
    );
  }
}

/**
 * Validate that commitment has all required ZK data
 */
export function validateCommitmentZKData(commitment: any): boolean {
  if (!commitment.zkData) return false;

  const required = [
    "owner",
    "mint",
    "blinding",
    "nullifierSecret",
    "nullifier",
    "commitmentHash",
  ];

  return required.every((field) => commitment.zkData[field]);
}
