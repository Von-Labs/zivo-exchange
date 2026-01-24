"use client";

import { useState, useEffect } from "react";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { INCO_TOKEN_PROGRAM_ID, ZIVO_WRAP_PROGRAM_ID } from "@/utils/constants";

interface VaultData {
  address: string;
  authority: string;
  splTokenMint: string;
  incoTokenMint: string;
  vaultTokenAccount: string;
  isInitialized: boolean;
}

interface DelegateMintAuthorityProps {
  selectedVault: VaultData | null;
}

const DelegateMintAuthority = ({ selectedVault }: DelegateMintAuthorityProps) => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const anchorWallet = useAnchorWallet();

  const [incoMint, setIncoMint] = useState("");
  const [splMint, setSplMint] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Auto-populate fields when vault is selected
  useEffect(() => {
    if (selectedVault) {
      setIncoMint(selectedVault.incoTokenMint);
      setSplMint(selectedVault.splTokenMint);
    }
  }, [selectedVault]);

  const handleDelegate = async () => {
    if (!publicKey || !anchorWallet) {
      setError("Please connect your wallet");
      return;
    }

    if (!incoMint || !splMint) {
      setError("Please fill in all required fields");
      return;
    }

    let incoMintPubkey: PublicKey;
    let splMintPubkey: PublicKey;

    try {
      incoMintPubkey = new PublicKey(incoMint);
      splMintPubkey = new PublicKey(splMint);
    } catch (err) {
      setError("Invalid mint address");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      // Derive vault PDA
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), splMintPubkey.toBuffer(), incoMintPubkey.toBuffer()],
        ZIVO_WRAP_PROGRAM_ID
      );

      // Build instruction to set mint authority
      // Discriminator for set_mint_authority: [67, 127, 155, 187, 100, 174, 103, 121]
      const discriminator = Buffer.from([67, 127, 155, 187, 100, 174, 103, 121]);

      // Args: new_authority (Option<Pubkey>)
      // Option::Some = 1 byte (1) + 32 bytes (pubkey)
      const instructionData = Buffer.alloc(8 + 1 + 32);
      let offset = 0;

      // Discriminator
      discriminator.copy(instructionData, offset);
      offset += 8;

      // Option::Some = 1
      instructionData.writeUInt8(1, offset);
      offset += 1;

      // New authority (vault PDA)
      vaultPda.toBuffer().copy(instructionData, offset);

      // Create instruction
      const instruction = new TransactionInstruction({
        programId: INCO_TOKEN_PROGRAM_ID,
        keys: [
          { pubkey: incoMintPubkey, isSigner: false, isWritable: true },
          { pubkey: publicKey, isSigner: true, isWritable: true },
        ],
        data: instructionData,
      });

      // Build transaction
      const tx = new Transaction().add(instruction);
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      // Send transaction
      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction(signature, "confirmed");

      setSuccess(
        `Successfully delegated mint authority to vault! Vault PDA: ${vaultPda.toBase58()}`
      );

      // Reset form
      setIncoMint("");
      setSplMint("");
    } catch (err: any) {
      console.error("Error delegating mint authority:", err);
      setError(err.message || "Failed to delegate mint authority");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Delegate Mint Authority</h2>
        <p className="text-gray-600 text-sm">
          Transfer Inco token mint authority to the vault PDA (required before wrapping)
        </p>
      </div>

      {selectedVault && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <span className="font-semibold">Selected Vault:</span> Fields auto-populated from vault selection
          </p>
        </div>
      )}

      <div className="space-y-4">
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
          <p className="text-xs text-gray-500 mt-1">
            Used to derive the vault PDA address
          </p>
        </div>

        {/* Info Box */}
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="font-semibold text-yellow-900 mb-2">
            Important: One-Time Setup
          </h3>
          <ul className="text-sm text-yellow-800 space-y-1">
            <li>• You must be the current mint authority of the Inco token</li>
            <li>• This transfers mint authority to the vault PDA</li>
            <li>• After this, only the vault can mint new Inco tokens</li>
            <li>• This is required before users can wrap tokens</li>
            <li>• Do this AFTER initializing the vault</li>
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

        {/* Delegate Button */}
        <button
          onClick={handleDelegate}
          disabled={loading || !publicKey}
          className={`w-full py-3 px-6 rounded-lg font-semibold transition-colors ${
            loading || !publicKey
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "bg-yellow-600 text-white hover:bg-yellow-700"
          }`}
        >
          {loading ? "Delegating Authority..." : "Delegate Mint Authority"}
        </button>

        {!publicKey && (
          <p className="text-sm text-gray-500 text-center">
            Please connect your wallet to delegate mint authority
          </p>
        )}
      </div>
    </div>
  );
};

export default DelegateMintAuthority;
