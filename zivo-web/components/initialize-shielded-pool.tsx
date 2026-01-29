"use client";

import { useState } from "react";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Keypair } from "@solana/web3.js";
import { getZivoWrapProgram, isAdmin } from "@/utils/constants";

interface VaultData {
  address: string;
  splTokenMint: string;
  incoTokenMint: string;
}

interface InitializeShieldedPoolProps {
  vault: VaultData;
  onSuccess?: () => void;
}

const InitializeShieldedPool = ({ vault, onSuccess }: InitializeShieldedPoolProps) => {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const anchorWallet = useAnchorWallet();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [treeDepth, setTreeDepth] = useState(26);

  const handleInitialize = async () => {
    if (!publicKey || !anchorWallet) {
      setError("Please connect your wallet");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const program = getZivoWrapProgram(connection, anchorWallet);

      // Derive shielded pool PDA
      const [shieldedPoolPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("shielded_pool"),
          new PublicKey(vault.splTokenMint).toBuffer(),
          new PublicKey(vault.incoTokenMint).toBuffer(),
        ],
        program.programId
      );

      console.log("Shielded Pool PDA:", shieldedPoolPda.toBase58());

      // Check if already initialized
      const poolAccount = await connection.getAccountInfo(shieldedPoolPda);
      if (poolAccount) {
        setError("Shielded pool already initialized for this vault");
        setLoading(false);
        return;
      }

      // Create Light Protocol merkle trees (mock addresses for now)
      // In production, these should be created via Light Protocol
      const stateTree = Keypair.generate().publicKey;
      const addressTree = Keypair.generate().publicKey;
      const nullifierQueue = Keypair.generate().publicKey;

      console.log("Initializing shielded pool with tree depth:", treeDepth);
      console.log("State tree:", stateTree.toBase58());
      console.log("Address tree:", addressTree.toBase58());
      console.log("Nullifier queue:", nullifierQueue.toBase58());

      // Initialize shielded pool
      const tx = await program.methods
        .initShieldedPool(treeDepth)
        .accounts({
          shieldedPool: shieldedPoolPda,
          vault: new PublicKey(vault.address),
          splTokenMint: new PublicKey(vault.splTokenMint),
          incoTokenMint: new PublicKey(vault.incoTokenMint),
          stateTree: stateTree,
          addressTree: addressTree,
          nullifierQueue: nullifierQueue,
          authority: publicKey,
          systemProgram: PublicKey.default,
        })
        .rpc();

      console.log("Transaction signature:", tx);
      setSuccess(`Shielded pool initialized successfully! Tree depth: ${treeDepth}`);

      if (onSuccess) {
        setTimeout(onSuccess, 2000);
      }
    } catch (err: any) {
      console.error("Error initializing shielded pool:", err);
      setError(`Failed to initialize: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  if (!publicKey) {
    return (
      <div className="text-center text-gray-500 py-8">
        Please connect your wallet to initialize shielded pool
      </div>
    );
  }

  // Check if user is admin
  if (!isAdmin(publicKey.toBase58())) {
    return (
      <div className="text-center py-12 border-2 border-dashed border-yellow-300 rounded-lg bg-yellow-50">
        <div className="text-4xl mb-4">🔒</div>
        <p className="text-gray-700 font-semibold mb-2">Admin Access Required</p>
        <p className="text-sm text-gray-600">
          Only administrators can initialize shielded pools.
        </p>
        <p className="text-xs text-gray-500 mt-2">
          Connected wallet: {publicKey.toBase58().slice(0, 8)}...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Initialize Shielded Pool</h2>
        <p className="text-gray-600 text-sm">
          Enable private transactions for this vault using Zero-Knowledge proofs
        </p>
      </div>

      {/* Vault Info */}
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <h3 className="font-semibold mb-2">Vault Information</h3>
        <div className="space-y-1 text-sm">
          <div>
            <span className="text-gray-500">Address:</span>{" "}
            <span className="font-mono">{vault.address.slice(0, 8)}...</span>
          </div>
          <div>
            <span className="text-gray-500">SPL Mint:</span>{" "}
            <span className="font-mono">{vault.splTokenMint.slice(0, 8)}...</span>
          </div>
          <div>
            <span className="text-gray-500">Inco Mint:</span>{" "}
            <span className="font-mono">{vault.incoTokenMint.slice(0, 8)}...</span>
          </div>
        </div>
      </div>

      {/* Configuration */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            Merkle Tree Depth
          </label>
          <select
            value={treeDepth}
            onChange={(e) => setTreeDepth(Number(e.target.value))}
            disabled={loading}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value={14}>14 (16,384 notes - Testing)</option>
            <option value={20}>20 (1M notes - Small)</option>
            <option value={26}>26 (67M notes - Recommended)</option>
            <option value={30}>30 (1B notes - Large)</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Higher depth = more capacity but higher proof generation cost
          </p>
        </div>
      </div>

      {/* Action Button */}
      <button
        onClick={handleInitialize}
        disabled={loading}
        className={`w-full py-3 rounded-lg font-semibold transition-colors ${
          loading
            ? "bg-gray-300 text-gray-500 cursor-not-allowed"
            : "bg-blue-600 text-white hover:bg-blue-700"
        }`}
      >
        {loading ? "Initializing..." : "Initialize Shielded Pool"}
      </button>

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-600 text-sm font-medium">{success}</p>
        </div>
      )}

      {/* Info Box */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="font-semibold text-blue-900 mb-2">What is a Shielded Pool?</h4>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>Enables private transactions using Zero-Knowledge proofs</li>
          <li>Hides sender, receiver, and amount information</li>
          <li>Uses merkle trees to track private notes</li>
          <li>Requires ZK proof generation for each transaction</li>
        </ul>
      </div>
    </div>
  );
};

export default InitializeShieldedPool;
