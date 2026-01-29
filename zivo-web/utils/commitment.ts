/**
 * Enhanced Commitment data structure for ZK proof generation
 * This extends the basic commitment with cryptographic data needed for unwrapping
 */

export interface Commitment {
  // Basic commitment data (existing)
  address: string; // The commitment address/hash
  amount: string; // Amount in lamports/base units
  vault: string; // Vault public key
  timestamp: number;
  txSignature: string;
  spent?: boolean;
  spentAt?: number;

  // ZK proof data (new - needed for unwrap_from_note)
  zkData?: {
    owner: string; // Owner public key as hex field
    mint: string; // Mint public key as hex field
    blinding: string; // Random blinding factor (hex)
    nullifierSecret: string; // Nullifier secret (hex)
    nullifier: string; // Derived nullifier (hex)
    commitmentHash: string; // Note hash (hex)

    // Light Protocol data (for merkle proof)
    leaf?: string; // Compressed account leaf hash
    leafIndex?: number; // Position in merkle tree
    root?: string; // Merkle root at time of creation
    siblings?: string[]; // Merkle path siblings
  };
}

/**
 * Inputs needed for ZK proof generation (matches Noir circuit)
 */
export interface ShieldedPoolInputs {
  root: string; // Merkle root
  nullifier: string; // Public nullifier
  recipient: string; // Recipient public key as field
  amount: number | string; // Amount to unwrap
  mint: string; // Token mint as field
  commitment: string; // Note commitment hash
  leaf: string; // Compressed account leaf
  index: number | string; // Leaf index in tree
  siblings: string[]; // Merkle proof siblings (32 elements)
  owner: string; // Owner public key as field (private)
  blinding: string; // Blinding factor (private)
  nullifier_secret: string; // Nullifier secret (private)
}

/**
 * Get all commitments from localStorage
 */
export function getAllCommitments(): Commitment[] {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem("shielded_commitments");
  return stored ? JSON.parse(stored) : [];
}

/**
 * Get unspent commitments for a specific vault
 */
export function getUnspentCommitmentsForVault(vaultAddress: string): Commitment[] {
  return getAllCommitments().filter(
    (c) => c.vault === vaultAddress && !c.spent
  );
}

/**
 * Mark a commitment as spent
 */
export function markCommitmentAsSpent(commitmentAddress: string): void {
  const all = getAllCommitments();
  const updated = all.map((c) =>
    c.address === commitmentAddress
      ? { ...c, spent: true, spentAt: Date.now() }
      : c
  );
  localStorage.setItem("shielded_commitments", JSON.stringify(updated));
}

/**
 * Save a new commitment to localStorage
 */
export function saveCommitment(commitment: Commitment): void {
  const all = getAllCommitments();
  all.push(commitment);
  localStorage.setItem("shielded_commitments", JSON.stringify(all));
}
