"use client";

import { useState, useEffect } from "react";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, Keypair, AccountInfo, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, getAccount, createSyncNativeInstruction } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import { getZivoWrapProgram, ZIVO_WRAP_PROGRAM_ID, INCO_LIGHTNING_ID, INCO_TOKEN_PROGRAM_ID, INCO_ACCOUNT_DISCRIMINATOR, getAllowancePda, extractHandle, getIncoTokenProgram } from "@/utils/constants";
import { fetchIncoMintDecimalsWithProgram } from "@/utils/orderbook/hooks/inco-accounts";
import { encryptValue } from "@inco/solana-sdk/encryption";
import { decrypt } from "@inco/solana-sdk/attested-decrypt";
import { fetchTokenMetadata, TokenMetadata } from "@/utils/helius";
import AddressWithCopy from "@/components/address-with-copy";
import bs58 from "bs58";
import { SPL_WRAPPED_SOL_MINT } from "@/utils/mints";

const WRAPPED_SOL_MINT = SPL_WRAPPED_SOL_MINT;

interface VaultData {
  address: string;
  authority: string;
  splTokenMint: string;
  incoTokenMint: string;
  vaultTokenAccount: string;
  isInitialized: boolean;
}

interface WrapTokenProps {
  selectedVault: VaultData | null;
}

const WrapToken = ({ selectedVault }: WrapTokenProps) => {
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

    try {
      // Fetch SPL token balance and decimals
      const splMint = new PublicKey(selectedVault.splTokenMint);
      const userSplAccount = await getAssociatedTokenAddress(splMint, publicKey);
      const isWrappedSol = selectedVault.splTokenMint === WRAPPED_SOL_MINT;

      // Fetch token metadata from Helius or use special metadata for wrapped SOL
      let metadata: TokenMetadata | null = null;
      if (isWrappedSol) {
        metadata = {
          name: "Wrapped SOL",
          symbol: "SOL",
          decimals: 9,
          logoURI: "https://statics.solscan.io/solscan-img/solana_icon.svg",
        };
      } else {
        metadata = await fetchTokenMetadata(selectedVault.splTokenMint);
      }

      if (metadata) {
        setTokenMetadata(metadata);
        console.log("Token metadata:", metadata);
      }

      let actualDecimals = 9; // Default fallback
      try {
        const splMintInfo = await connection.getParsedAccountInfo(splMint);
        actualDecimals = (splMintInfo.value?.data as any)?.parsed?.info?.decimals || 9;
        setSplDecimals(actualDecimals);
        console.log("Actual decimals from mint:", actualDecimals);

        // For wrapped SOL, show native SOL balance
        if (isWrappedSol) {
          const solBalance = await connection.getBalance(publicKey);
          setSplBalance((solBalance / LAMPORTS_PER_SOL).toString());
        } else {
          const splAccountInfo = await getAccount(connection, userSplAccount);
          setSplBalance((Number(splAccountInfo.amount) / Math.pow(10, actualDecimals)).toString());
        }
      } catch {
        if (isWrappedSol) {
          // Try to get native SOL balance even if wSOL account doesn't exist
          try {
            const solBalance = await connection.getBalance(publicKey);
            setSplBalance((solBalance / LAMPORTS_PER_SOL).toString());
          } catch {
            setSplBalance("0");
          }
        } else {
          setSplBalance("0");
        }
      }

      // Fetch Inco token account (encrypted) and decimals
      const incoMint = new PublicKey(selectedVault.incoTokenMint);

      // Fetch Inco mint decimals using Anchor program (similar to test)
      // Reference: lightning-rod-solana/tests/inco-token.ts:169
      // const mintAccount = await program.account.incoMint.fetch(mintKeypair.publicKey);
      if (anchorWallet) {
        try {
          const incoDecimalsFromMint = await fetchIncoMintDecimalsWithProgram(
            connection,
            anchorWallet,
            incoMint
          );

          if (incoDecimalsFromMint !== null) {
            console.log("Inco decimals from program.account.incoMint.fetch:", incoDecimalsFromMint);
            setIncoDecimals(incoDecimalsFromMint);
          } else {
            // Fallback to SPL decimals if fetch fails
            console.log("Failed to fetch inco decimals, using SPL decimals:", actualDecimals);
            setIncoDecimals(actualDecimals);
          }
        } catch (error) {
          console.error("Error fetching inco decimals:", error);
          setIncoDecimals(actualDecimals);
        }
      } else {
        setIncoDecimals(actualDecimals);
      }

      // Try PDA first
      const [userIncoAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("account"), incoMint.toBuffer(), publicKey.toBuffer()],
        INCO_TOKEN_PROGRAM_ID
      );

      try {
        let incoAccountInfo = await connection.getAccountInfo(userIncoAccount);

        // If PDA doesn't exist, search for Keypair accounts
        if (!incoAccountInfo) {
          const accounts = await connection.getProgramAccounts(INCO_TOKEN_PROGRAM_ID, {
            filters: [
              {
                memcmp: {
                  offset: 8, // After discriminator
                  bytes: incoMint.toBase58(),
                },
              },
              {
                memcmp: {
                  offset: 40, // After discriminator + mint (8 + 32)
                  bytes: publicKey.toBase58(),
                },
              },
            ],
          });

          if (accounts.length > 0) {
            incoAccountInfo = accounts[0].account;
          }
        }

        if (incoAccountInfo) {
          setIncoBalance("Encrypted (Click Decrypt to view)");
        } else {
          setIncoBalance("0");
        }
      } catch {
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

      // Try PDA first
      const [pdaAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("account"), incoMint.toBuffer(), publicKey.toBuffer()],
        INCO_TOKEN_PROGRAM_ID
      );

      let incoAccountInfo = await connection.getAccountInfo(pdaAccount);

      // If PDA doesn't exist, search for all user's Inco accounts for this mint
      if (!incoAccountInfo) {
        console.log("PDA account not found, searching for user Inco accounts...");

        const accounts = await connection.getProgramAccounts(INCO_TOKEN_PROGRAM_ID, {
          filters: [
            {
              memcmp: {
                offset: 8, // After discriminator
                bytes: incoMint.toBase58(),
              },
            },
            {
              memcmp: {
                offset: 40, // After discriminator + mint (8 + 32)
                bytes: publicKey.toBase58(),
              },
            },
          ],
        });

        if (accounts.length === 0) {
          setDecryptedBalance("0");
          setDecrypting(false);
          return;
        }

        // Use the first account found
        incoAccountInfo = accounts[0].account;
        console.log("Found Inco account:", accounts[0].pubkey.toBase58());
      }

      // Extract handle from account data
      const handle = extractHandle(incoAccountInfo.data);
      console.log("Handle for decryption:", handle.toString());

      // Decrypt using Inco SDK
      console.log("Attempting to decrypt with address:", publicKey.toBase58());
      const result = await decrypt([handle.toString()], {
        address: publicKey,
        signMessage,
      });

      if (result.plaintexts && result.plaintexts.length > 0) {
        const decrypted = BigInt(result.plaintexts[0]);
        const balance = (Number(decrypted) / Math.pow(10, incoDecimals)).toString();
        console.log("Decrypt details:", {
          plaintextRaw: result.plaintexts[0],
          decryptedBigInt: decrypted.toString(),
          incoDecimals,
          divisor: Math.pow(10, incoDecimals),
          balance,
        });
        setDecryptedBalance(balance);
      } else {
        console.log("No plaintexts in decrypt result");
        setDecryptedBalance("0");
      }
    } catch (err: any) {
      console.error("Error decrypting balance:", err);

      // If allowance error, suggest waiting or re-wrapping
      if (err.message && err.message.includes("not allowed")) {
        setError("Allowance not yet granted or still processing. Please wait a few seconds and try again, or re-wrap tokens.");
      } else {
        setError(err.message || "Failed to decrypt balance");
      }
    } finally {
      setDecrypting(false);
    }
  };

  const handleWrapToken = async () => {
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
      const isWrappedSol = selectedVault.splTokenMint === WRAPPED_SOL_MINT;

      // Derive vault PDA
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), splMintPubkey.toBuffer(), incoMintPubkey.toBuffer()],
        ZIVO_WRAP_PROGRAM_ID
      );

      // Get token accounts
      const userSplAccount = await getAssociatedTokenAddress(splMintPubkey, publicKey);
      const vaultTokenAccount = await getAssociatedTokenAddress(splMintPubkey, vaultPda, true);

      // For wrapped SOL: Convert native SOL to wSOL first
      if (isWrappedSol) {
        const amountLamports = Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL);
        console.log(`Converting ${amount} SOL (${amountLamports} lamports) to wSOL...`);

        // Check if user has enough SOL
        const solBalance = await connection.getBalance(publicKey);
        // Reserve 0.01 SOL for transaction fees
        const reservedLamports = 0.01 * LAMPORTS_PER_SOL;
        if (solBalance < amountLamports + reservedLamports) {
          setError(`Insufficient SOL balance. You need ${amount} SOL + ~0.01 SOL for transaction fees.`);
          setLoading(false);
          return;
        }

        // Create wSOL account if it doesn't exist and sync SOL
        const { Transaction } = await import("@solana/web3.js");
        const { createAssociatedTokenAccountInstruction } = await import("@solana/spl-token");

        const wsolTx = new Transaction();

        // Check if wSOL account exists
        const userSplAccountInfo = await connection.getAccountInfo(userSplAccount);
        if (!userSplAccountInfo) {
          // Create associated token account for wSOL
          wsolTx.add(
            createAssociatedTokenAccountInstruction(
              publicKey,
              userSplAccount,
              publicKey,
              splMintPubkey
            )
          );
        }

        // Transfer SOL to wSOL account
        wsolTx.add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: userSplAccount,
            lamports: amountLamports,
          })
        );

        // Sync native (converts SOL balance to wSOL tokens)
        wsolTx.add(createSyncNativeInstruction(userSplAccount));

        const wsolSig = await sendTransaction(wsolTx, connection);
        await connection.confirmTransaction(wsolSig, "confirmed");
        console.log("✓ SOL converted to wSOL. Signature:", wsolSig);
      } else {
        // Check if user has SPL token account for non-wSOL tokens
        const userSplAccountInfo = await connection.getAccountInfo(userSplAccount);
        if (!userSplAccountInfo) {
          setError("You don't have a token account for this SPL token. Please create one first.");
          setLoading(false);
          return;
        }
      }

      // Search for existing Inco token account (Keypair-based, not PDA)
      console.log("Searching for existing Inco token account...");
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

      let userIncoAccount: PublicKey;
      let incoAccountInfo: AccountInfo<Buffer> | null;

      if (existingAccounts.length > 0) {
        // Reuse existing account
        userIncoAccount = existingAccounts[0].pubkey;
        incoAccountInfo = existingAccounts[0].account;
        console.log("✓ Found existing Inco token account:", userIncoAccount.toBase58());
      } else {
        // Create new Keypair account
        console.log("No existing Inco account found, creating new one...");

        const incoAccountKeypair = Keypair.generate();
        const incoTokenProgram = getIncoTokenProgram(connection, anchorWallet);

        try {
          // Initialize Inco token account
          await incoTokenProgram.methods
            .initializeAccount()
            .accounts({
              account: incoAccountKeypair.publicKey,
              mint: incoMintPubkey,
              owner: publicKey,
              payer: publicKey,
              systemProgram: SystemProgram.programId,
              incoLightningProgram: INCO_LIGHTNING_ID,
            } as any)
            .signers([incoAccountKeypair])
            .rpc();

          console.log("✓ Inco token account created:", incoAccountKeypair.publicKey.toBase58());

          userIncoAccount = incoAccountKeypair.publicKey;
          incoAccountInfo = await connection.getAccountInfo(userIncoAccount);
        } catch (err: any) {
          console.error("Error creating Inco token account:", err);
          setError(`Failed to create Inco token account: ${err.message}`);
          setLoading(false);
          return;
        }
      }

      // Check Inco mint authority
      console.log("Checking Inco mint authority...");
      const incoMintInfo = await connection.getAccountInfo(incoMintPubkey);
      if (incoMintInfo && incoMintInfo.data.length > 0) {
        // Mint authority is at offset 8 (discriminator) + 1 (option byte) + authority pubkey
        const authorityOption = incoMintInfo.data[8];
        if (authorityOption === 1) {
          const authorityBytes = incoMintInfo.data.slice(9, 41);
          const mintAuthority = new PublicKey(authorityBytes);
          console.log("Current mint authority:", mintAuthority.toBase58());
          console.log("Expected vault PDA:", vaultPda.toBase58());

          if (!mintAuthority.equals(vaultPda)) {
            setError(`Mint authority mismatch! Current: ${mintAuthority.toBase58()}, Expected vault PDA: ${vaultPda.toBase58()}. Please re-initialize the vault.`);
            setLoading(false);
            return;
          }
          console.log("✓ Mint authority is correctly set to vault PDA");
        } else {
          setError("Inco mint has no authority set!");
          setLoading(false);
          return;
        }
      }

      // Encrypt the amount using Inco SDK
      const amountLamports = Math.floor(parseFloat(amount) * Math.pow(10, splDecimals));
      const amountBigInt = BigInt(amountLamports);
      console.log("Wrap amount details:", {
        inputAmount: amount,
        splDecimals,
        amountLamports,
        amountBigInt: amountBigInt.toString(),
      });
      const encryptedHex = await encryptValue(amountBigInt);
      const ciphertext = Buffer.from(encryptedHex, 'hex');
      const inputType = 0;

      // Get allowance PDA (use existing incoAccountInfo)
      const remainingAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = [];

      if (incoAccountInfo) {
        const handle = extractHandle(incoAccountInfo.data);
        const [allowancePda] = getAllowancePda(handle, publicKey);
        remainingAccounts.push(
          { pubkey: allowancePda, isSigner: false, isWritable: true },
          { pubkey: publicKey, isSigner: false, isWritable: false }
        );
      }

      // Build transaction
      console.log("Building transaction with params:", {
        ciphertextLength: ciphertext.length,
        inputType,
        amountLamports,
        vault: vaultPda.toBase58(),
        userSplAccount: userSplAccount.toBase58(),
        userIncoAccount: userIncoAccount.toBase58(),
        remainingAccounts: remainingAccounts.map(a => ({ pubkey: a.pubkey.toBase58(), isWritable: a.isWritable, isSigner: a.isSigner }))
      });

      const tx = await program.methods
        .wrapToken(ciphertext, inputType, new BN(amountLamports))
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
        .remainingAccounts(remainingAccounts)
        .transaction();

      // Set fee payer and recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      console.log("Transaction built successfully, simulating...");

      // Simulate transaction first to catch errors early
      try {
        const simulation = await connection.simulateTransaction(tx);
        console.log("Simulation result:", simulation);

        if (simulation.value.err) {
          console.error("Simulation failed:", simulation.value.err);
          throw new Error(`Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`);
        }
      } catch (simError: any) {
        console.error("Simulation error:", simError);
        throw simError;
      }

      console.log("Simulation successful, sending transaction...");
      const signature = await sendTransaction(tx, connection);
      console.log("Transaction sent:", signature);

      await connection.confirmTransaction(signature, "confirmed");
      console.log("Transaction confirmed!");

      // Grant allowance for decryption
      console.log("Granting allowance for decryption...");
      try {
        // Wait a bit for account to be updated
        await new Promise(r => setTimeout(r, 1000));

        const accountInfoAfter = await connection.getAccountInfo(userIncoAccount);
        if (accountInfoAfter) {
          const handle = extractHandle(accountInfoAfter.data);
          console.log("Handle for allowance:", handle.toString());

          const [allowancePda] = getAllowancePda(handle, publicKey);
          console.log("Allowance PDA:", allowancePda.toBase58());

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
              { pubkey: allowancePda, isSigner: false, isWritable: true },
              { pubkey: publicKey, isSigner: false, isWritable: false },
            ])
            .transaction();

          const allowanceSignature = await sendTransaction(allowanceTx, connection);
          await connection.confirmTransaction(allowanceSignature, "confirmed");
          console.log("Allowance granted! Signature:", allowanceSignature);

          // Wait for TEE processing (important!)
          console.log("Waiting 5 seconds for TEE processing...");
          await new Promise(r => setTimeout(r, 5000));
        }
      } catch (allowanceErr) {
        console.error("Error granting allowance:", allowanceErr);
        // Don't fail the whole operation if allowance fails
      }

      setSuccess(`Successfully wrapped ${amount} tokens! Transaction: ${signature}`);
      setAmount("");

      // Refresh balances
      fetchBalances();
    } catch (err: any) {
      console.error("Error wrapping token:", err);

      // Extract detailed error message
      let errorMessage = "Failed to wrap token";
      if (err?.message) {
        errorMessage = err.message;

        // Detect error 3012 (missing mint authority)
        if (errorMessage.includes("3012") || errorMessage.includes("0xBCC")) {
          errorMessage = "Mint authority error: The vault PDA does not have mint authority over the Inco token. This should have been delegated during vault initialization. You may need to re-initialize the vault.";
        }
      }
      if (err?.logs) {
        console.error("Transaction logs:", err.logs);
      }

      setError(errorMessage);
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
          Please select a vault from the list to wrap tokens
        </p>
      </div>
    );
  }

  const isWrappedSol = selectedVault.splTokenMint === WRAPPED_SOL_MINT;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">
          Wrap Token ({isWrappedSol ? "SOL" : "SPL"} → Inco)
        </h2>
        <p className="text-gray-600 text-sm">
          Convert {isWrappedSol ? "SOL" : "SPL tokens"} to encrypted Inco tokens
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
                className="w-10 h-10 rounded-full object-contain border-2 border-white shadow-sm bg-white p-1"
                onError={(e) => {
                  // Fallback to gradient icon if image fails
                  e.currentTarget.outerHTML = `<div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center text-white font-bold shadow-md">${tokenMetadata.symbol?.[0] || 'T'}</div>`;
                }}
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center text-white font-bold shadow-md">
                {tokenMetadata.symbol?.[0] || 'T'}
              </div>
            )}
            <div>
              <p className="font-semibold text-blue-900">{tokenMetadata.name}</p>
              <p className="text-sm text-blue-600">{tokenMetadata.symbol} • {tokenMetadata.decimals} decimals</p>
            </div>
          </div>
        </div>
      )}

      {/* Balances */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-700 font-medium">
            {isWrappedSol ? "SOL Balance" : "SPL Balance"} {tokenMetadata && `(${tokenMetadata.symbol})`}
          </p>
          <p className="text-2xl font-bold text-green-900">{splBalance}</p>
        </div>
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
            <button
              onClick={() => setAmount(splBalance)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              MAX
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Amount of {isWrappedSol ? "SOL" : "SPL tokens"} to wrap
          </p>
        </div>

        {/* Info Box */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">How it works</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            {isWrappedSol && (
              <li>• Your SOL is automatically converted to wSOL</li>
            )}
            <li>• Your {isWrappedSol ? "wSOL" : "SPL tokens"} are transferred to the vault</li>
            <li>• Equivalent Inco tokens are minted to your account</li>
            <li>• Balance is encrypted using FHE</li>
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
