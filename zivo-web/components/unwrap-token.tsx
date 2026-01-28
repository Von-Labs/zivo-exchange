"use client";

import { useState, useEffect } from "react";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import { getZivoWrapProgram, ZIVO_WRAP_PROGRAM_ID, INCO_LIGHTNING_ID, INCO_TOKEN_PROGRAM_ID, INCO_ACCOUNT_DISCRIMINATOR, getAllowancePda, extractHandle } from "@/utils/constants";
import { encryptValue } from "@inco/solana-sdk/encryption";
import { decrypt } from "@inco/solana-sdk/attested-decrypt";
import { fetchTokenMetadata, TokenMetadata } from "@/utils/helius";
import AddressWithCopy from "@/components/address-with-copy";
import bs58 from "bs58";

interface VaultData {
  address: string;
  authority: string;
  splTokenMint: string;
  incoTokenMint: string;
  vaultTokenAccount: string;
  isInitialized: boolean;
}

interface UnwrapTokenProps {
  selectedVault: VaultData | null;
}

const UnwrapToken = ({ selectedVault }: UnwrapTokenProps) => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, signMessage } = useWallet();
  const anchorWallet = useAnchorWallet();

  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [splBalance, setSplBalance] = useState<string>("0");
  const [incoBalance, setIncoBalance] = useState<string>("Encrypted");
  const [decryptedBalance, setDecryptedBalance] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(false);
  const [splDecimals, setSplDecimals] = useState<number>(9);
  const [incoDecimals, setIncoDecimals] = useState<number>(9);
  const [tokenMetadata, setTokenMetadata] = useState<TokenMetadata | null>(null);

  // Fetch balances when vault is selected
  useEffect(() => {
    if (selectedVault && publicKey) {
      fetchBalances();
    }
  }, [selectedVault, publicKey]);

  const fetchBalances = async () => {
    if (!selectedVault || !publicKey) return;

    // Fetch token metadata from Helius
    const metadata = await fetchTokenMetadata(selectedVault.splTokenMint);
    if (metadata) {
      setTokenMetadata(metadata);
      console.log("Token metadata from Helius:", metadata);
    }

    try {
      // Fetch SPL token balance and decimals
      const splMint = new PublicKey(selectedVault.splTokenMint);
      const userSplAccount = await getAssociatedTokenAddress(splMint, publicKey);

      let decimals = 9; // Default value
      try {
        const splMintInfo = await connection.getParsedAccountInfo(splMint);
        decimals = (splMintInfo.value?.data as any)?.parsed?.info?.decimals || 9;
        setSplDecimals(decimals);

        const splAccountInfo = await getAccount(connection, userSplAccount);
        setSplBalance((Number(splAccountInfo.amount) / Math.pow(10, decimals)).toString());
      } catch {
        setSplBalance("0");
      }

      // Fetch Inco token account (encrypted) and decimals
      const incoMint = new PublicKey(selectedVault.incoTokenMint);

      try {
        const incoMintInfo = await connection.getAccountInfo(incoMint);
        if (incoMintInfo && incoMintInfo.data.length > 76) {
          // Read decimals from offset 76 in IncoMint for verification
          const decimalsByte = incoMintInfo.data[76];
          console.log("Inco mint decimals at offset 76:", decimalsByte);
          // Always use SPL decimals for consistency in 1:1 token conversion
          setIncoDecimals(decimals);
        } else {
          setIncoDecimals(decimals);
        }
      } catch {
        setIncoDecimals(decimals);
      }

      // Search for existing Inco token account (Keypair-based, not PDA)
      console.log("Searching for Inco token account...");
      console.log("Inco mint:", incoMint.toBase58());
      console.log("User wallet:", publicKey.toBase58());

      try {
        const existingAccounts = await connection.getProgramAccounts(INCO_TOKEN_PROGRAM_ID, {
          filters: [
            {
              memcmp: {
                offset: 0,
                bytes: bs58.encode(Buffer.from(INCO_ACCOUNT_DISCRIMINATOR)),
              },
            },
            { memcmp: { offset: 8, bytes: incoMint.toBase58() } }, // mint
            { memcmp: { offset: 40, bytes: publicKey.toBase58() } }, // owner
          ],
        });

        if (existingAccounts.length > 0) {
          console.log("✓ Found Inco token account:", existingAccounts[0].pubkey.toBase58());
          setIncoBalance("Encrypted (Click Decrypt to view)");
        } else {
          console.log("✗ No Inco token account found - need to wrap tokens first");
          setIncoBalance("0");
        }
      } catch (err) {
        console.error("Error fetching Inco token account:", err);
        setIncoBalance("0");
      }
    } catch (err) {
      console.error("Error fetching balances:", err);
    }
  };

  const handleDecrypt = async () => {
    if (!selectedVault || !publicKey || !signMessage) {
      setError("Please connect your wallet");
      return;
    }

    setDecrypting(true);
    setError("");

    try {
      const incoMint = new PublicKey(selectedVault.incoTokenMint);

      // Search for Inco token account (Keypair-based)
      const existingAccounts = await connection.getProgramAccounts(INCO_TOKEN_PROGRAM_ID, {
        filters: [
          {
            memcmp: {
              offset: 0,
              bytes: bs58.encode(Buffer.from(INCO_ACCOUNT_DISCRIMINATOR)),
            },
          },
          { memcmp: { offset: 8, bytes: incoMint.toBase58() } }, // mint
          { memcmp: { offset: 40, bytes: publicKey.toBase58() } }, // owner
        ],
      });

      if (existingAccounts.length === 0) {
        setDecryptedBalance("0");
        return;
      }

      const incoAccountInfo = existingAccounts[0].account;

      // Extract handle from account data
      const handle = extractHandle(incoAccountInfo.data as Buffer);

      // Decrypt using Inco SDK
      const result = await decrypt([handle.toString()], {
        address: publicKey,
        signMessage,
      });

      if (result.plaintexts && result.plaintexts.length > 0) {
        const decrypted = BigInt(result.plaintexts[0]);
        setDecryptedBalance((Number(decrypted) / Math.pow(10, incoDecimals)).toString());
      }
    } catch (err: any) {
      console.error("Error decrypting balance:", err);
      setError(err.message || "Failed to decrypt balance");
    } finally {
      setDecrypting(false);
    }
  };

  const handleUnwrapToken = async () => {
    if (!publicKey || !anchorWallet || !selectedVault) {
      setError("Please connect your wallet and select a vault");
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const program = getZivoWrapProgram(connection, anchorWallet);

      const splMintPubkey = new PublicKey(selectedVault.splTokenMint);
      const incoMintPubkey = new PublicKey(selectedVault.incoTokenMint);

      // Derive vault PDA
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), splMintPubkey.toBuffer(), incoMintPubkey.toBuffer()],
        ZIVO_WRAP_PROGRAM_ID
      );

      // Get token accounts
      const userSplAccount = await getAssociatedTokenAddress(splMintPubkey, publicKey);
      const vaultTokenAccount = await getAssociatedTokenAddress(splMintPubkey, vaultPda, true);

      // Search for user's Inco token account (Keypair-based)
      const existingAccounts = await connection.getProgramAccounts(INCO_TOKEN_PROGRAM_ID, {
        filters: [
          {
            memcmp: {
              offset: 0,
              bytes: bs58.encode(Buffer.from(INCO_ACCOUNT_DISCRIMINATOR)),
            },
          },
          { memcmp: { offset: 8, bytes: incoMintPubkey.toBase58() } }, // mint
          { memcmp: { offset: 40, bytes: publicKey.toBase58() } }, // owner
        ],
      });

      if (existingAccounts.length === 0) {
        throw new Error("Inco token account not found. Please wrap some tokens first.");
      }

      const userIncoAccount = existingAccounts[0].pubkey;
      console.log("Using Inco token account:", userIncoAccount.toBase58());

      // Encrypt the amount using Inco SDK
      const amountLamports = Math.floor(parseFloat(amount) * Math.pow(10, incoDecimals));
      const amountBigInt = BigInt(amountLamports);
      console.log("Unwrapping amount (lamports):", amountLamports);

      const encryptedHex = await encryptValue(amountBigInt);
      const ciphertext = Buffer.from(encryptedHex, 'hex');
      const inputType = 0;
      console.log("Encrypted ciphertext length:", ciphertext.length);

      console.log("Transaction accounts:", {
        vault: vaultPda.toBase58(),
        splTokenMint: splMintPubkey.toBase58(),
        incoTokenMint: incoMintPubkey.toBase58(),
        userSplTokenAccount: userSplAccount.toBase58(),
        vaultTokenAccount: vaultTokenAccount.toBase58(),
        userIncoTokenAccount: userIncoAccount.toBase58(),
        user: publicKey.toBase58(),
      });

      // Build transaction (without allowance - allowance only needed for decrypt, not unwrap)
      const tx = await program.methods
        .unwrapToken(ciphertext, inputType, new BN(amountLamports))
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

      // Set fee payer
      tx.feePayer = publicKey;

      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;

      // Simulate transaction first to check for errors
      console.log("Simulating transaction...");
      try {
        const simulation = await connection.simulateTransaction(tx);
        console.log("Simulation result:", simulation);

        if (simulation.value.err) {
          console.error("Simulation failed:", simulation.value.err);
          console.error("Simulation logs:", simulation.value.logs);
          throw new Error(`Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`);
        }

        console.log("✓ Simulation successful!");
        console.log("Simulation logs:", simulation.value.logs);
      } catch (simErr) {
        console.error("Simulation error:", simErr);
        throw simErr;
      }

      console.log("Sending unwrap transaction...");
      const signature = await sendTransaction(tx, connection);
      console.log("Unwrap transaction sent, signature:", signature);

      await connection.confirmTransaction(signature, "confirmed");
      console.log("Unwrap transaction confirmed!");

      // Wait for transaction to settle
      console.log("Waiting 3 seconds for unwrap to settle...");
      await new Promise(r => setTimeout(r, 3000));

      // Step 2: After unwrap, the handle has changed - re-read it and grant allowance
      console.log("\n--- Re-reading handle after unwrap ---");
      const incoAccountInfoAfterUnwrap = await connection.getAccountInfo(userIncoAccount);
      if (!incoAccountInfoAfterUnwrap) {
        throw new Error("Inco token account not found after unwrap");
      }

      const handleAfterUnwrap = extractHandle(incoAccountInfoAfterUnwrap.data);
      console.log("New handle after unwrap:", handleAfterUnwrap.toString());

      const [allowancePdaAfterUnwrap] = getAllowancePda(handleAfterUnwrap, publicKey);
      console.log("New allowance PDA:", allowancePdaAfterUnwrap.toBase58());

      // Grant allowance for the new handle
      console.log("\n--- Granting allowance for new handle ---");
      const allowanceTx = await program.methods
        .grantAllowance()
        .accounts({
          incoTokenMint: incoMintPubkey,
          userIncoTokenAccount: userIncoAccount,
          user: publicKey,
          incoLightningProgram: INCO_LIGHTNING_ID,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts([
          { pubkey: allowancePdaAfterUnwrap, isSigner: false, isWritable: true },
          { pubkey: publicKey, isSigner: false, isWritable: false },
        ])
        .transaction();

      const allowanceSignature = await sendTransaction(allowanceTx, connection);
      await connection.confirmTransaction(allowanceSignature, "confirmed");
      console.log("Allowance granted! Signature:", allowanceSignature);

      // Wait for TEE processing
      console.log("Waiting 5 seconds for TEE processing...");
      await new Promise(r => setTimeout(r, 5000));

      setSuccess(`Successfully unwrapped ${amount} tokens! Transaction: ${signature}`);
      setAmount("");

      // Refresh balances
      fetchBalances();
    } catch (err: any) {
      console.error("Error unwrapping token:", err);
      setError(err.message || "Failed to unwrap token");
    } finally {
      setLoading(false);
    }
  };

  if (!selectedVault) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 mb-4">
          <svg className="mx-auto h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-700 mb-2">No Vault Selected</h3>
        <p className="text-sm text-gray-500">
          Please select a vault from the list to unwrap tokens
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Unwrap Token (Inco → SPL)</h2>
        <p className="text-gray-600 text-sm">
          Convert encrypted Inco tokens back to SPL tokens
        </p>
      </div>

      {/* Selected Vault Info */}
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <h3 className="font-semibold text-gray-900 mb-2">Selected Vault</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-gray-500">SPL Token:</span>
            <AddressWithCopy
              address={selectedVault.splTokenMint}
              textClassName="font-mono text-green-600"
              buttonClassName="text-green-700/70 hover:text-green-700 hover:bg-green-100"
            />
          </div>
          <div>
            <span className="text-gray-500">Inco Token:</span>
            <AddressWithCopy
              address={selectedVault.incoTokenMint}
              textClassName="font-mono text-purple-600"
              buttonClassName="text-purple-700/70 hover:text-purple-700 hover:bg-purple-100"
            />
          </div>
        </div>
      </div>

      {/* Token Info from Helius */}
      {tokenMetadata && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center gap-3">
            {tokenMetadata.logoURI ? (
              <img
                src={tokenMetadata.logoURI.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/')}
                alt={tokenMetadata.symbol}
                className="w-10 h-10 rounded-full object-contain bg-white p-1 border-2 border-white shadow-sm"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                {tokenMetadata.symbol?.[0] || 'T'}
              </div>
            )}
            <div>
              <p className="font-semibold text-blue-900">{tokenMetadata.name}</p>
              <p className="text-sm text-blue-600">{tokenMetadata.symbol} • {splDecimals} decimals</p>
            </div>
          </div>
        </div>
      )}

      {/* Balances */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <div className="flex justify-between items-start mb-1">
            <p className="text-sm text-purple-700 font-medium">
              Inco Balance {tokenMetadata && `(${tokenMetadata.symbol})`}
            </p>
            <button
              onClick={handleDecrypt}
              disabled={decrypting || incoBalance === "0"}
              className="text-xs text-purple-600 hover:text-purple-800 underline disabled:opacity-50"
            >
              {decrypting ? "Decrypting..." : "Decrypt"}
            </button>
          </div>
          <p className="text-2xl font-bold text-purple-900">
            {decryptedBalance !== null ? decryptedBalance : incoBalance}
          </p>
        </div>
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-700 font-medium">
            SPL Balance {tokenMetadata && `(${tokenMetadata.symbol})`}
          </p>
          <p className="text-2xl font-bold text-green-900">{splBalance}</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Amount */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Amount <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              min="0"
              step="any"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              disabled={loading}
            />
            <button
              onClick={() => decryptedBalance && setAmount(decryptedBalance)}
              disabled={!decryptedBalance}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-green-600 hover:text-green-800 font-medium disabled:opacity-50"
            >
              MAX
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Amount of Inco tokens to unwrap
          </p>
        </div>

        {/* Info Box */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">How it works</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Your encrypted Inco tokens are burned</li>
            <li>• Equivalent SPL tokens are transferred from vault to you</li>
            <li>• Transaction is verified using FHE proofs</li>
            <li>• Privacy is maintained throughout the process</li>
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

        {/* Unwrap Button */}
        <button
          onClick={handleUnwrapToken}
          disabled={loading || !publicKey}
          className={`w-full py-3 px-6 rounded-lg font-semibold transition-colors ${
            loading || !publicKey
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "bg-green-600 text-white hover:bg-green-700"
          }`}
        >
          {loading ? "Unwrapping Tokens..." : "Unwrap Tokens"}
        </button>

        {!publicKey && (
          <p className="text-sm text-gray-500 text-center">
            Please connect your wallet to unwrap tokens
          </p>
        )}
      </div>
    </div>
  );
};

export default UnwrapToken;
