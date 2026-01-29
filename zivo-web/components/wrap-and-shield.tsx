"use client";

import { useState, useEffect } from "react";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import { getZivoWrapProgram, INCO_TOKEN_PROGRAM_ID, INCO_LIGHTNING_ID } from "@/utils/constants";
import { getAccount } from "@solana/spl-token";

interface VaultData {
  address: string;
  splTokenMint: string;
  incoTokenMint: string;
  vaultTokenAccount: string;
}

interface WrapAndShieldProps {
  vault: VaultData;
}

const WrapAndShield = ({ vault }: WrapAndShieldProps) => {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const anchorWallet = useAnchorWallet();

  const [amount, setAmount] = useState("");
  const [balance, setBalance] = useState<bigint>(BigInt(0));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [commitmentAddress, setCommitmentAddress] = useState("");

  useEffect(() => {
    loadBalance();
  }, [publicKey, vault]);

  const loadBalance = async () => {
    if (!publicKey) return;

    try {
      // Find user's SPL token account
      const accounts = await connection.getTokenAccountsByOwner(publicKey, {
        mint: new PublicKey(vault.splTokenMint),
      });

      if (accounts.value.length > 0) {
        const accountInfo = await getAccount(connection, accounts.value[0].pubkey);
        setBalance(accountInfo.amount);
      }
    } catch (err) {
      console.error("Error loading balance:", err);
    }
  };

  const handleWrapAndShield = async () => {
    if (!publicKey || !anchorWallet) {
      setError("Please connect your wallet");
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    setCommitmentAddress("");

    try {
      const program = getZivoWrapProgram(connection, anchorWallet);
      const amountLamports = BigInt(Math.floor(parseFloat(amount) * 1e9));

      // Check balance
      if (amountLamports > balance) {
        setError("Insufficient balance");
        setLoading(false);
        return;
      }

      // Derive shielded pool PDA
      const [shieldedPoolPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("shielded_pool"),
          new PublicKey(vault.splTokenMint).toBuffer(),
          new PublicKey(vault.incoTokenMint).toBuffer(),
        ],
        program.programId
      );

      // Check if shielded pool is initialized
      const poolAccount = await connection.getAccountInfo(shieldedPoolPda);
      if (!poolAccount) {
        setError("Shielded pool not initialized for this vault");
        setLoading(false);
        return;
      }

      // Generate commitment (in production, use proper commitment generation)
      const commitment = Keypair.generate().publicKey.toBytes();
      console.log("Generated commitment:", Buffer.from(commitment).toString("hex"));

      // Mock Light Protocol accounts (replace with actual Light SDK integration)
      const addressTree = Keypair.generate().publicKey;
      const addressQueue = Keypair.generate().publicKey;
      const stateQueue = Keypair.generate().publicKey;
      const stateTree = Keypair.generate().publicKey;

      // Mock validity proof
      const validityProof = {
        proof: null,
      };

      // Mock address tree info
      const addressTreeInfo = {
        addressMerkleTreePubkeyIndex: 0,
        addressQueuePubkeyIndex: 0,
        rootIndex: 0,
      };

      // Get user token accounts
      const userSplAccounts = await connection.getTokenAccountsByOwner(publicKey, {
        mint: new PublicKey(vault.splTokenMint),
      });

      if (userSplAccounts.value.length === 0) {
        setError("No SPL token account found");
        setLoading(false);
        return;
      }

      const userSplTokenAccount = userSplAccounts.value[0].pubkey;

      // Get or create user Inco token account
      const userIncoAccounts = await connection.getProgramAccounts(INCO_TOKEN_PROGRAM_ID, {
        filters: [
          { memcmp: { offset: 8, bytes: vault.incoTokenMint } },
          { memcmp: { offset: 40, bytes: publicKey.toBase58() } },
        ],
      });

      let userIncoTokenAccount: PublicKey;
      if (userIncoAccounts.length > 0) {
        userIncoTokenAccount = userIncoAccounts[0].pubkey;
      } else {
        // Create new Inco token account (simplified)
        setError("Please create an Inco token account first in the Wrap Token tab");
        setLoading(false);
        return;
      }

      // Mock ciphertext (in production, encrypt with TEE public key)
      const ciphertext = new Uint8Array(128).fill(0);

      console.log("Calling wrap_and_commit...");
      const tx = await program.methods
        .wrapAndCommit(
          Array.from(ciphertext),
          0, // input_type
          amountLamports.toString(),
          Array.from(commitment),
          validityProof,
          addressTreeInfo,
          0, // output_state_tree_index
          0  // system_accounts_offset
        )
        .accounts({
          shieldedPool: shieldedPoolPda,
          vault: new PublicKey(vault.address),
          splTokenMint: new PublicKey(vault.splTokenMint),
          incoTokenMint: new PublicKey(vault.incoTokenMint),
          userSplTokenAccount: userSplTokenAccount,
          vaultTokenAccount: new PublicKey(vault.vaultTokenAccount),
          userIncoTokenAccount: userIncoTokenAccount,
          user: publicKey,
          tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
          systemProgram: SystemProgram.programId,
          incoLightningProgram: INCO_LIGHTNING_ID,
          incoTokenProgram: INCO_TOKEN_PROGRAM_ID,
          addressTree: addressTree,
          addressQueue: addressQueue,
          stateQueue: stateQueue,
          stateTree: stateTree,
        })
        .rpc();

      console.log("Transaction signature:", tx);

      // Generate commitment address display
      const commitmentAddr = new PublicKey(commitment).toBase58();
      setCommitmentAddress(commitmentAddr);

      // Save commitment to localStorage
      saveCommitment({
        address: commitmentAddr,
        amount: amount,
        vault: vault.address,
        timestamp: Date.now(),
        txSignature: tx,
      });

      setSuccess(`Successfully wrapped and shielded ${amount} tokens!`);
      setAmount("");
      await loadBalance();
    } catch (err: any) {
      console.error("Error wrapping and shielding:", err);
      setError(`Failed: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const saveCommitment = (commitment: any) => {
    const existing = JSON.parse(localStorage.getItem("shielded_commitments") || "[]");
    existing.push(commitment);
    localStorage.setItem("shielded_commitments", JSON.stringify(existing));
  };

  const formatBalance = (bal: bigint) => {
    return (Number(bal) / 1e9).toFixed(6);
  };

  if (!publicKey) {
    return (
      <div className="text-center text-gray-500 py-8">
        Please connect your wallet
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Wrap & Shield Tokens</h2>
        <p className="text-gray-600 text-sm">
          Wrap SPL tokens and commit them to the shielded pool for private transactions
        </p>
      </div>

      {/* Balance Display */}
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Available Balance:</span>
          <span className="font-semibold text-lg">{formatBalance(balance)} SPL</span>
        </div>
      </div>

      {/* Amount Input */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Amount to Wrap & Shield
        </label>
        <div className="relative">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            disabled={loading}
            className="w-full px-4 py-3 pr-20 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
          />
          <button
            onClick={() => setAmount(formatBalance(balance))}
            disabled={loading}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded"
          >
            MAX
          </button>
        </div>
      </div>

      {/* Action Button */}
      <button
        onClick={handleWrapAndShield}
        disabled={loading || !amount || parseFloat(amount) <= 0}
        className={`w-full py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
          loading || !amount || parseFloat(amount) <= 0
            ? "bg-gray-300 text-gray-500 cursor-not-allowed"
            : "bg-green-600 text-white hover:bg-green-700"
        }`}
      >
        <span>🛡️</span>
        {loading ? "Processing..." : "Wrap & Shield"}
      </button>

      {/* Commitment Address */}
      {commitmentAddress && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <h4 className="font-semibold text-green-900 mb-2">Commitment Created</h4>
          <p className="text-sm text-green-800 mb-2">
            Save this commitment address to use your shielded tokens:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 bg-white border border-green-300 rounded text-xs font-mono break-all">
              {commitmentAddress}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(commitmentAddress);
                alert("Copied!");
              }}
              className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
            >
              Copy
            </button>
          </div>
        </div>
      )}

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
        <h4 className="font-semibold text-blue-900 mb-2">How it works:</h4>
        <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
          <li>Your SPL tokens are transferred to the vault</li>
          <li>Equivalent Inco tokens are minted to your account</li>
          <li>A cryptographic commitment is created and stored on-chain</li>
          <li>Only you can prove ownership of this commitment using ZK proofs</li>
        </ol>
      </div>
    </div>
  );
};

export default WrapAndShield;
