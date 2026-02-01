"use client";

import { useState } from "react";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { getProgram, PROGRAM_ID, INCO_LIGHTNING_ID, INCO_TOKEN_PROGRAM_ID } from "@/utils/constants";

const WrapToken = () => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const anchorWallet = useAnchorWallet();

  const [splMint, setSplMint] = useState("");
  const [incoMint, setIncoMint] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleWrapToken = async () => {
    if (!publicKey || !anchorWallet) {
      setError("Please connect your wallet");
      return;
    }

    if (!splMint || !incoMint || !amount) {
      setError("Please fill in all required fields");
      return;
    }

    let splMintPubkey: PublicKey;
    let incoMintPubkey: PublicKey;

    try {
      splMintPubkey = new PublicKey(splMint);
      incoMintPubkey = new PublicKey(incoMint);
    } catch (err) {
      setError("Invalid mint address");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const program = getProgram(connection, anchorWallet);

      // Derive vault PDA
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), splMintPubkey.toBuffer(), incoMintPubkey.toBuffer()],
        PROGRAM_ID
      );

      // Get token accounts
      const userSplAccount = await getAssociatedTokenAddress(
        splMintPubkey,
        publicKey
      );

      const vaultTokenAccount = await getAssociatedTokenAddress(
        splMintPubkey,
        vaultPda,
        true
      );

      // Get or derive user's Inco token account
      const [userIncoAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("account"), incoMintPubkey.toBuffer(), publicKey.toBuffer()],
        INCO_TOKEN_PROGRAM_ID
      );

      // Encrypt the amount using Inco SDK
      // TODO: Integrate with @inco/solana-sdk for encryption
      const ciphertext = Buffer.from([0]); // Placeholder
      const inputType = 0; // Placeholder

      const amountLamports = parseFloat(amount) * Math.pow(10, 9); // Assuming 9 decimals

      // Build transaction
      const tx = await program.methods
        .wrapToken(Array.from(ciphertext), inputType, amountLamports)
        .accounts({
          vault: vaultPda,
          splTokenMint: splMintPubkey,
          incoTokenMint: incoMintPubkey,
          userSplTokenAccount: userSplAccount,
          vaultTokenAccount: vaultTokenAccount,
          userIncoTokenAccount: userIncoAccount,
          user: publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          incoLightningProgram: INCO_LIGHTNING_ID,
          incoTokenProgram: INCO_TOKEN_PROGRAM_ID,
        })
        .transaction();

      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction(signature, "confirmed");

      setSuccess(
        `Successfully wrapped ${amount} tokens! Transaction: ${signature}`
      );

      // Reset form
      setAmount("");
    } catch (err: any) {
      console.error("Error wrapping token:", err);
      setError(err.message || "Failed to wrap token");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Wrap Token (SPL → Inco)</h2>
        <p className="text-gray-600 text-sm">
          Convert SPL tokens to encrypted Inco tokens
        </p>
      </div>

      <div className="space-y-4">
        {/* SPL Mint Address */}
        <div>
          <label className="block text-sm font-medium mb-2">
            SPL Token Mint <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={splMint}
            onChange={(e) => setSplMint(e.target.value)}
            placeholder="Enter SPL token mint address"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={loading}
          />
        </div>

        {/* Inco Mint Address */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Inco Token Mint <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={incoMint}
            onChange={(e) => setIncoMint(e.target.value)}
            placeholder="Enter Inco token mint address"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={loading}
          />
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Amount <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            min="0"
            step="any"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={loading}
          />
          <p className="text-xs text-gray-500 mt-1">
            Amount of SPL tokens to wrap
          </p>
        </div>

        {/* Info Box */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">How it works</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Your SPL tokens are transferred to the vault</li>
            <li>• Equivalent Inco tokens are minted to your account</li>
            <li>• Balance is encrypted</li>
            <li>• Only you can decrypt your balance</li>
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
            <p className="text-green-600 text-sm font-medium">{success}</p>
          </div>
        )}

        {/* Wrap Button */}
        <button
          onClick={handleWrapToken}
          disabled={loading || !publicKey}
          className={`w-full py-3 px-6 rounded-lg font-semibold transition-colors ${
            loading || !publicKey
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {loading ? "Wrapping Tokens..." : "Wrap Tokens"}
        </button>

        {!publicKey && (
          <p className="text-sm text-gray-500 text-center">
            Please connect your wallet to wrap tokens
          </p>
        )}
      </div>
    </div>
  );
};

export default WrapToken;
