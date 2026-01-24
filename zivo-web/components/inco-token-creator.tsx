"use client";

import { useState } from "react";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import { getProgram, PROGRAM_ID } from "@/utils/constants";

const IncoTokenCreator = () => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const anchorWallet = useAnchorWallet();

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [decimals, setDecimals] = useState("6");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [mintAddress, setMintAddress] = useState("");

  const handleCreateToken = async () => {
    if (!publicKey || !anchorWallet) {
      setError("Please connect your wallet");
      return;
    }

    if (!name || !symbol) {
      setError("Please fill in all required fields");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    setMintAddress("");

    try {
      // Get Anchor program
      const program = getProgram(connection, anchorWallet);

      // Generate new keypair for the mint
      const mintKeypair = Keypair.generate();

      // Get rent-exempt balance for mint account
      const lamports = await connection.getMinimumBalanceForRentExemption(
        8 + 1 + 32 + 16 // Discriminator + bump + authority + handle
      );

      // Build transaction to initialize Zivo Exchange mint
      const tx = await program.methods
        .initializeMint()
        .accounts({
          mint: mintKeypair.publicKey,
          authority: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .preInstructions([
          SystemProgram.createAccount({
            fromPubkey: publicKey,
            newAccountPubkey: mintKeypair.publicKey,
            space: 8 + 1 + 32 + 16,
            lamports,
            programId: PROGRAM_ID,
          }),
        ])
        .transaction();

      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      // Sign with mint keypair
      tx.partialSign(mintKeypair);

      // Send transaction
      const signature = await sendTransaction(tx, connection);

      // Wait for confirmation
      await connection.confirmTransaction(signature, "confirmed");

      setMintAddress(mintKeypair.publicKey.toBase58());
      setSuccess(
        `Zivo Exchange Token created successfully! Mint: ${mintKeypair.publicKey.toBase58()}`
      );

      // Reset form
      setName("");
      setSymbol("");
      setDecimals("6");
    } catch (err: any) {
      console.error("Error creating Zivo Exchange token:", err);
      setError(err.message || "Failed to create Zivo Exchange token");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">
          Create Zivo Exchange Token (FHE)
        </h2>
        <p className="text-gray-600 text-sm">
          Create a privacy-preserving token with Fully Homomorphic Encryption
        </p>
      </div>

      <div className="space-y-4">
        {/* Token Name */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Token Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Private Token"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={loading}
          />
        </div>

        {/* Token Symbol */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Token Symbol <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="e.g., PVTK"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={loading}
          />
        </div>

        {/* Decimals */}
        <div>
          <label className="block text-sm font-medium mb-2">Decimals</label>
          <input
            type="number"
            value={decimals}
            onChange={(e) => setDecimals(e.target.value)}
            min="0"
            max="9"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={loading}
          />
          <p className="text-xs text-gray-500 mt-1">
            Standard for Zivo Exchange tokens is 6 decimals
          </p>
        </div>

        {/* Info Box */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">
            What is a Zivo Exchange Token?
          </h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Balances are encrypted using FHE (Fully Homomorphic Encryption)</li>
            <li>• Only the owner can decrypt their balance</li>
            <li>• Transactions remain private on-chain</li>
            <li>• Powered by Zivo Exchange encryption technology</li>
          </ul>
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-600 text-sm font-medium mb-2">
              {success}
            </p>
            {mintAddress && (
              <div className="mt-2">
                <p className="text-xs text-gray-600 mb-1">Mint Address:</p>
                <code className="text-xs bg-gray-100 p-2 rounded block break-all">
                  {mintAddress}
                </code>
              </div>
            )}
          </div>
        )}

        {/* Create Button */}
        <button
          onClick={handleCreateToken}
          disabled={loading || !publicKey}
          className={`w-full py-3 px-6 rounded-lg font-semibold transition-colors ${
            loading || !publicKey
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {loading
            ? "Creating Zivo Exchange Token..."
            : "Create Zivo Exchange Token (FHE)"}
        </button>

        {!publicKey && (
          <p className="text-sm text-gray-500 text-center">
            Please connect your wallet to create a token
          </p>
        )}
      </div>
    </div>
  );
};

export default IncoTokenCreator;
