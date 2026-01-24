"use client";

import { useState } from "react";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import { getZivoWrapProgram, ZIVO_WRAP_PROGRAM_ID, INCO_TOKEN_PROGRAM_ID } from "@/utils/constants";

const InitializeVault = () => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const anchorWallet = useAnchorWallet();

  const [splMint, setSplMint] = useState("");
  const [incoMint, setIncoMint] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [vaultAddress, setVaultAddress] = useState("");

  const handleInitializeVault = async () => {
    if (!publicKey || !anchorWallet) {
      setError("Please connect your wallet");
      return;
    }

    if (!splMint || !incoMint) {
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
    setVaultAddress("");

    try {
      const program = getZivoWrapProgram(connection, anchorWallet);

      // Derive vault PDA
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), splMintPubkey.toBuffer(), incoMintPubkey.toBuffer()],
        ZIVO_WRAP_PROGRAM_ID
      );

      // Get vault's token account
      const vaultTokenAccount = await getAssociatedTokenAddress(
        splMintPubkey,
        vaultPda,
        true // allowOwnerOffCurve
      );

      // Check if vault token account exists
      const accountInfo = await connection.getAccountInfo(vaultTokenAccount);

      // Check current mint authority
      const incoMintInfo = await connection.getAccountInfo(incoMintPubkey);
      if (!incoMintInfo) {
        throw new Error("Inco mint account not found");
      }

      // IncoMint layout: 8 discriminator + 36 mint_authority
      // mint_authority is COption<Pubkey>: 1 byte (0=None, 1=Some) + 32 bytes pubkey
      const mintAuthorityOption = incoMintInfo.data[8]; // 0 = None, 1 = Some
      let currentAuthority: PublicKey | null = null;

      if (mintAuthorityOption === 1) {
        // Authority exists, read it
        currentAuthority = new PublicKey(incoMintInfo.data.slice(9, 41));
        console.log("Current mint authority:", currentAuthority.toBase58());
      }

      // Step 1: Delegate Inco mint authority to vault PDA (if not already delegated)
      if (currentAuthority && currentAuthority.equals(vaultPda)) {
        console.log("✓ Mint authority already delegated to vault PDA, skipping...");
      } else {
        console.log("Step 1: Delegating Inco mint authority to vault...");

        const discriminator = Buffer.from([67, 127, 155, 187, 100, 174, 103, 121]);
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

        // Create set_mint_authority instruction
        const setAuthorityIx = new TransactionInstruction({
          programId: INCO_TOKEN_PROGRAM_ID,
          keys: [
            { pubkey: incoMintPubkey, isSigner: false, isWritable: true },
            { pubkey: publicKey, isSigner: true, isWritable: true },
          ],
          data: instructionData,
        });

        const delegateTx = new Transaction().add(setAuthorityIx);
        const delegateSignature = await sendTransaction(delegateTx, connection);
        await connection.confirmTransaction(delegateSignature, "confirmed");
        console.log("Mint authority delegated successfully!");
      }

      // Step 2: Initialize vault
      console.log("Step 2: Initializing vault...");
      const tx = await program.methods
        .initializeVault()
        .accounts({
          vault: vaultPda,
          splTokenMint: splMintPubkey,
          incoTokenMint: incoMintPubkey,
          vaultTokenAccount: vaultTokenAccount,
          authority: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .preInstructions(
          !accountInfo
            ? [
                createAssociatedTokenAccountInstruction(
                  publicKey,
                  vaultTokenAccount,
                  vaultPda,
                  splMintPubkey
                ),
              ]
            : []
        )
        .transaction();

      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction(signature, "confirmed");
      console.log("Vault initialized successfully!");

      setVaultAddress(vaultPda.toBase58());
      setSuccess(
        `Vault initialized and mint authority delegated! Vault: ${vaultPda.toBase58()}`
      );

      // Reset form
      setSplMint("");
      setIncoMint("");
    } catch (err: any) {
      console.error("Error initializing vault:", err);
      setError(err.message || "Failed to initialize vault");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Initialize Vault</h2>
        <p className="text-gray-600 text-sm">
          Create a vault to wrap SPL tokens to Inco tokens (one-time setup)
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

        {/* Info Box */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">
            Important Notes
          </h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Both SPL and Inco token mints must already exist</li>
            <li>• You must be the current authority for the Inco mint</li>
            <li>• Mint authority will be automatically delegated to the vault</li>
            <li>• This is a one-time setup per token pair</li>
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
            {vaultAddress && (
              <div className="mt-2">
                <p className="text-xs text-gray-600 mb-1">Vault Address:</p>
                <code className="text-xs bg-gray-100 p-2 rounded block break-all">
                  {vaultAddress}
                </code>
              </div>
            )}
          </div>
        )}

        {/* Initialize Button */}
        <button
          onClick={handleInitializeVault}
          disabled={loading || !publicKey}
          className={`w-full py-3 px-6 rounded-lg font-semibold transition-colors ${
            loading || !publicKey
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {loading ? "Initializing Vault..." : "Initialize Vault"}
        </button>

        {!publicKey && (
          <p className="text-sm text-gray-500 text-center">
            Please connect your wallet to initialize a vault
          </p>
        )}
      </div>
    </div>
  );
};

export default InitializeVault;
