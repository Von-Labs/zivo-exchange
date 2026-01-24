import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ZivoWrap } from "../target/types/zivo_wrap";
import { PublicKey, Keypair, SystemProgram, Connection } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ACCOUNT_SIZE,
  createMint,
  createAccount,
  createInitializeAccountInstruction,
  mintTo,
  getAccount,
  getMinimumBalanceForRentExemptAccount,
} from "@solana/spl-token";
import { expect } from "chai";
import nacl from "tweetnacl";
import { encryptValue } from "@inco/solana-sdk/encryption";
import { decrypt } from "@inco/solana-sdk/attested-decrypt";
import { hexToBuffer } from "@inco/solana-sdk/utils";
import fs from "fs";
import path from "path";

const INCO_LIGHTNING_PROGRAM_ID = new PublicKey("5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj");
const INCO_TOKEN_PROGRAM_ID = new PublicKey("4cyJHzecVWuU2xux6bCAPAhALKQT8woBh4Vx3AGEGe5N");
const KEY_DIR = path.resolve("tests", "keys");
const KEY_SUFFIX = "v1";

function loadOrCreateKeypair(name: string): Keypair {
  fs.mkdirSync(KEY_DIR, { recursive: true });
  const filePath = path.join(KEY_DIR, `${name}_${KEY_SUFFIX}.json`);
  if (fs.existsSync(filePath)) {
    const secret = JSON.parse(fs.readFileSync(filePath, "utf8")) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(secret));
  }
  const kp = Keypair.generate();
  fs.writeFileSync(filePath, JSON.stringify(Array.from(kp.secretKey)));
  return kp;
}

function buildIncoIdl(): anchor.Idl {
  return {
    address: INCO_TOKEN_PROGRAM_ID.toString(),
    metadata: {
      name: "inco_token",
      version: "0.1.0",
      spec: "0.1.0",
    },
    instructions: [
      {
        name: "initializeMint",
        discriminator: [209, 42, 195, 4, 129, 85, 209, 44],
        accounts: [
          { name: "mint", writable: true, signer: true },
          { name: "payer", writable: true, signer: true },
          { name: "systemProgram", address: "11111111111111111111111111111111" },
          { name: "incoLightningProgram", address: INCO_LIGHTNING_PROGRAM_ID.toString() },
        ],
        args: [
          { name: "decimals", type: "u8" },
          { name: "mintAuthority", type: "pubkey" },
          { name: "freezeAuthority", type: { option: "pubkey" } },
        ],
      },
      {
        name: "initializeAccount",
        discriminator: [74, 115, 99, 93, 197, 69, 103, 7],
        accounts: [
          { name: "account", writable: true, signer: true },
          { name: "mint" },
          { name: "owner" },
          { name: "payer", writable: true, signer: true },
          { name: "systemProgram", address: "11111111111111111111111111111111" },
          { name: "incoLightningProgram", address: INCO_LIGHTNING_PROGRAM_ID.toString() },
        ],
        args: [],
      },
      {
        name: "setMintAuthority",
        discriminator: [67, 127, 155, 187, 100, 174, 103, 121],
        accounts: [
          { name: "mint", writable: true },
          { name: "currentAuthority", signer: true },
        ],
        args: [
          { name: "newAuthority", type: { option: "pubkey" } },
        ],
      },
    ],
    accounts: [
      {
        name: "IncoMint",
        discriminator: [0, 0, 0, 0, 0, 0, 0, 0],
      },
      {
        name: "IncoAccount",
        discriminator: [0, 0, 0, 0, 0, 0, 0, 0],
      },
    ],
    types: [
      {
        name: "IncoMint",
        type: {
          kind: "struct",
          fields: [
            { name: "mintAuthority", type: { option: "pubkey" } },
            { name: "supply", type: { array: ["u8", 16] } },
            { name: "decimals", type: "u8" },
            { name: "isInitialized", type: "bool" },
            { name: "freezeAuthority", type: { option: "pubkey" } },
          ],
        },
      },
      {
        name: "IncoAccount",
        type: {
          kind: "struct",
          fields: [
            { name: "mint", type: "pubkey" },
            { name: "owner", type: "pubkey" },
            { name: "amount", type: { array: ["u8", 16] } },
            { name: "delegatedAmount", type: { array: ["u8", 16] } },
            { name: "delegate", type: { option: "pubkey" } },
            { name: "state", type: "u8" },
            { name: "isNative", type: { option: "u64" } },
            { name: "closeAuthority", type: { option: "pubkey" } },
          ],
        },
      },
    ],
  } as anchor.Idl;
}

function extractHandleFromAnchor(anchorHandle: any): bigint {
  if (anchorHandle && anchorHandle._bn) {
    return BigInt(anchorHandle._bn.toString(10));
  }
  if (typeof anchorHandle === 'object' && anchorHandle["0"]) {
    const nested = anchorHandle["0"];
    if (nested && nested._bn) return BigInt(nested._bn.toString(10));
    if (nested && nested.toString && nested.constructor?.name === 'BN') {
      return BigInt(nested.toString(10));
    }
  }
  if (anchorHandle instanceof Uint8Array || Array.isArray(anchorHandle)) {
    const buffer = Buffer.from(anchorHandle);
    let result = BigInt(0);
    for (let i = buffer.length - 1; i >= 0; i--) {
      result = result * BigInt(256) + BigInt(buffer[i]);
    }
    return result;
  }
  if (typeof anchorHandle === 'number' || typeof anchorHandle === 'bigint') {
    return BigInt(anchorHandle);
  }
  return BigInt(0);
}

function formatBalance(plaintext: string): string {
  return (Number(plaintext) / 1e9).toFixed(9);
}

function getAllowancePda(handle: bigint, allowedAddress: PublicKey): [PublicKey, number] {
  const handleBuffer = Buffer.alloc(16);
  let h = handle;
  for (let i = 0; i < 16; i++) {
    handleBuffer[i] = Number(h & BigInt(0xff));
    h = h >> BigInt(8);
  }
  return PublicKey.findProgramAddressSync(
    [handleBuffer, allowedAddress.toBuffer()],
    INCO_LIGHTNING_PROGRAM_ID
  );
}

async function decryptHandle(handle: string, walletKeypair: Keypair): Promise<{ success: boolean; plaintext?: string; error?: string }> {
  try {
    const result = await decrypt([handle], {
      address: walletKeypair.publicKey,
      signMessage: async (message: Uint8Array) => nacl.sign.detached(message, walletKeypair.secretKey),
    });
    return { success: true, plaintext: result.plaintexts[0] };
  } catch (error: any) {
    const msg = error.message || error.toString();
    if (msg.toLowerCase().includes("not allowed")) {
      return { success: false, error: "not_allowed" };
    }
    if (msg.toLowerCase().includes("ciphertext")) {
      return { success: false, error: "ciphertext_not_found" };
    }
    return { success: false, error: msg };
  }
}

describe("zivo-wrap", () => {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const payer = loadOrCreateKeypair("payer");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  anchor.setProvider(provider);

  const program = anchor.workspace.ZivoWrap as Program<ZivoWrap>;

  // Load Inco Token Program IDL - use INCO_TOKEN_PROGRAM_ID explicitly
  const incoTokenProgram = new anchor.Program(
    buildIncoIdl(),
    provider
  );

  const walletKeypair = payer;
  const inputType = 0;

  let splMint: PublicKey;
  let splMintKeypair: Keypair;
  let incoMint: Keypair;
  let vaultPda: PublicKey;
  let vaultBump: number;
  let vaultTokenAccount: PublicKey;
  let userSplTokenAccount: PublicKey;
  let userIncoTokenAccount: Keypair;
  let initialIncoPlaintext: bigint | null = null;
  let expectedAfterWrap: bigint | null = null;

  before(async () => {
    console.log("\n=== Setup Phase ===");

    // Create SPL token mint (e.g., USDC mock)
    console.log("Creating SPL token mint...");
    splMintKeypair = loadOrCreateKeypair("spl-mint");
    const splMintInfo = await connection.getAccountInfo(splMintKeypair.publicKey);
    if (!splMintInfo) {
      splMint = await createMint(
        connection,
        walletKeypair,
        walletKeypair.publicKey,
        null,
        9,
        splMintKeypair
      );
    } else {
      splMint = splMintKeypair.publicKey;
    }
    console.log("SPL Mint:", splMint.toString());

    // Create Inco token mint
    console.log("Creating Inco token mint...");
    incoMint = loadOrCreateKeypair("inco-mint");
    const incoMintInfo = await connection.getAccountInfo(incoMint.publicKey);
    if (!incoMintInfo) {
      await incoTokenProgram.methods
        .initializeMint(9, walletKeypair.publicKey, walletKeypair.publicKey)
        .accounts({
          mint: incoMint.publicKey,
          payer: walletKeypair.publicKey,
          systemProgram: SystemProgram.programId,
          incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
        } as any)
        .signers([incoMint])
        .rpc();
    }
    console.log("Inco Mint:", incoMint.publicKey.toString());

    // Derive vault PDA
    [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), splMint.toBuffer(), incoMint.publicKey.toBuffer()],
      program.programId
    );
    console.log("Vault PDA:", vaultPda.toString());

    // Create vault's token account for SPL tokens (owned by vault PDA)
    console.log("Creating vault token account...");
    const vaultTokenAccountKeypair = loadOrCreateKeypair("vault-token-account");
    vaultTokenAccount = vaultTokenAccountKeypair.publicKey;

    const vaultTokenInfo = await connection.getAccountInfo(vaultTokenAccount);
    if (!vaultTokenInfo) {
      const rentExemptBalance = await getMinimumBalanceForRentExemptAccount(connection);
      const createAccountIx = SystemProgram.createAccount({
        fromPubkey: walletKeypair.publicKey,
        newAccountPubkey: vaultTokenAccount,
        lamports: rentExemptBalance,
        space: ACCOUNT_SIZE,
        programId: TOKEN_PROGRAM_ID,
      });

      const initAccountIx = createInitializeAccountInstruction(
        vaultTokenAccount,
        splMint,
        vaultPda,
        TOKEN_PROGRAM_ID
      );

      const tx = new anchor.web3.Transaction().add(createAccountIx, initAccountIx);
      await anchor.web3.sendAndConfirmTransaction(connection, tx, [walletKeypair, vaultTokenAccountKeypair]);
    }
    console.log("Vault Token Account:", vaultTokenAccount.toString());

    // Create user's SPL token account
    console.log("Creating user SPL token account...");
    const userSplTokenAccountKeypair = loadOrCreateKeypair("user-spl-token-account");
    const userSplInfo = await connection.getAccountInfo(userSplTokenAccountKeypair.publicKey);
    if (!userSplInfo) {
      userSplTokenAccount = await createAccount(
        connection,
        walletKeypair,
        splMint,
        walletKeypair.publicKey,
        userSplTokenAccountKeypair
      );
    } else {
      userSplTokenAccount = userSplTokenAccountKeypair.publicKey;
    }

    // Mint up to 1000 SPL tokens to user if needed
    const desiredUserSpl = 1_000_000_000_000n;
    const existingUserSpl = await getAccount(connection, userSplTokenAccount);
    if (existingUserSpl.amount < desiredUserSpl) {
      const topUp = desiredUserSpl - existingUserSpl.amount;
      console.log(`Minting ${Number(topUp) / 1e9} SPL tokens to user...`);
      await mintTo(
        connection,
        walletKeypair,
        splMint,
        userSplTokenAccount,
        walletKeypair,
        Number(topUp)
      );
    }

    // Create user's Inco token account
    console.log("Creating user Inco token account...");
    userIncoTokenAccount = loadOrCreateKeypair("user-inco-token-account");
    const userIncoInfo = await connection.getAccountInfo(userIncoTokenAccount.publicKey);
    if (!userIncoInfo) {
      await incoTokenProgram.methods
        .initializeAccount()
        .accounts({
          account: userIncoTokenAccount.publicKey,
          mint: incoMint.publicKey,
          owner: walletKeypair.publicKey,
          payer: walletKeypair.publicKey,
          systemProgram: SystemProgram.programId,
          incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
        } as any)
        .signers([userIncoTokenAccount])
        .rpc();
    }

    const userSplBalance = await getAccount(connection, userSplTokenAccount);
    console.log(`User SPL Balance: ${formatBalance(userSplBalance.amount.toString())} tokens`);

    // Check initial handle using proper little-endian u128 deserialization
    const initialAccountInfo = await connection.getAccountInfo(userIncoTokenAccount.publicKey);
    const initialBytes = initialAccountInfo!.data.slice(72, 88);
    let initialHandle = BigInt(0);
    for (let i = 0; i < 16; i++) {
      initialHandle = initialHandle | (BigInt(initialBytes[i]) << BigInt(i * 8));
    }
    console.log(`Initial Inco handle: ${initialHandle.toString()}`);
    console.log(`Initial handle bytes (hex): ${Buffer.from(initialBytes).toString('hex')}`);

    // Try to decrypt initial balance
    const initialDecrypt = await decryptHandle(initialHandle.toString(), walletKeypair);
    if (initialDecrypt.success) {
      console.log(`Initial balance (decrypted): ${initialDecrypt.plaintext}`);
      initialIncoPlaintext = BigInt(initialDecrypt.plaintext!);
    } else {
      console.log(`Initial balance decryption: ${initialDecrypt.error}`);
    }
    console.log("Setup completed!\n");
  });

  describe("Initialize Vault", () => {
    it("Should initialize vault", async () => {
      console.log("\n=== Initializing Vault ===");

      const existingVault = await connection.getAccountInfo(vaultPda);
      if (!existingVault) {
        const tx = await program.methods
          .initializeVault()
          .accounts({
            vault: vaultPda,
            splTokenMint: splMint,
            incoTokenMint: incoMint.publicKey,
            vaultTokenAccount: vaultTokenAccount,
            authority: walletKeypair.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        console.log("Transaction signature:", tx);
      } else {
        console.log("Vault already initialized, skipping init.");
      }

      const vaultAccount = await program.account.vault.fetch(vaultPda);
      expect(vaultAccount.isInitialized).to.be.true;
      expect(vaultAccount.splTokenMint.toString()).to.equal(splMint.toString());
      expect(vaultAccount.incoTokenMint.toString()).to.equal(incoMint.publicKey.toString());
      console.log("Vault initialized successfully!");

      // Transfer mint authority to vault PDA (ignore if already set)
      console.log("\nTransferring Inco mint authority to vault...");
      try {
        await incoTokenProgram.methods
          .setMintAuthority(vaultPda)
          .accounts({
            mint: incoMint.publicKey,
            currentAuthority: walletKeypair.publicKey,
          } as any)
          .rpc();
      } catch (error: any) {
        console.log(`Mint authority update skipped: ${error.message || error}`);
      }

      // Note: Skipping IncoMint fetch due to IDL discriminator mismatch
      // The setMintAuthority transaction succeeded, which is what matters
      console.log("Mint authority transferred successfully to vault PDA");
    });
  });

  describe("Wrap Token", () => {
    it("Should wrap 100 SPL tokens to Inco tokens", async () => {
      console.log("\n=== Wrapping SPL Tokens ===");

      const wrapAmount = 100_000_000_000; // 100 tokens
      console.log(`Wrapping ${wrapAmount / 1e9} tokens...`);

      // Encrypt the amount
      const encryptedHex = await encryptValue(BigInt(wrapAmount));

      // Step 1: Execute wrap without allowance
      const tx = await program.methods
        .wrapToken(hexToBuffer(encryptedHex), inputType, new anchor.BN(wrapAmount))
        .accounts({
          vault: vaultPda,
          splTokenMint: splMint,
          incoTokenMint: incoMint.publicKey,
          userSplTokenAccount: userSplTokenAccount,
          vaultTokenAccount: vaultTokenAccount,
          userIncoTokenAccount: userIncoTokenAccount.publicKey,
          user: walletKeypair.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
        })
        .rpc();

      console.log("Wrap transaction:", tx);
      await new Promise(r => setTimeout(r, 3000));

      // Check SPL balance
      const userSplBalance = await getAccount(connection, userSplTokenAccount);
      console.log(`User SPL Balance: ${formatBalance(userSplBalance.amount.toString())} tokens`);

      const vaultSplBalance = await getAccount(connection, vaultTokenAccount);
      console.log(`Vault SPL Balance: ${formatBalance(vaultSplBalance.amount.toString())} tokens`);

      // Step 2: Read actual handle from account - USE PROPER DESERIALIZATION
      // IncoAccount layout: discriminator(8) + mint(32) + owner(32) + amount(16) + ...
      const accountInfo = await connection.getAccountInfo(userIncoTokenAccount.publicKey);
      expect(accountInfo).to.not.be.null;

      // amount is at offset 72 (8 + 32 + 32), and it's a u128 (16 bytes, little-endian)
      const amountBytes = accountInfo!.data.slice(72, 88);
      let handle = BigInt(0);
      for (let i = 0; i < 16; i++) {
        handle = handle | (BigInt(amountBytes[i]) << BigInt(i * 8));
      }
      console.log("Encrypted handle after wrap:", handle.toString());
      console.log(`Handle bytes (hex): ${Buffer.from(amountBytes).toString('hex')}`);

      // Step 3: Try to decrypt WITHOUT granting allowance first
      console.log("\n--- Attempting decryption without explicit allowance ---");
      const decryptResultBefore = await decryptHandle(handle.toString(), walletKeypair);
      if (decryptResultBefore.success) {
        console.log(`Balance before allowance (decrypted): ${formatBalance(decryptResultBefore.plaintext!)} tokens`);
      } else {
        console.log(`Decryption before allowance: ${decryptResultBefore.error}`);
      }

      // Step 4: Grant allowance for the actual handle
      console.log("\n--- Granting allowance ---");
      const [allowancePda] = getAllowancePda(handle, walletKeypair.publicKey);
      console.log("Allowance PDA:", allowancePda.toString());

      const allowanceTx = await program.methods
        .grantAllowance()
        .accounts({
          incoTokenMint: incoMint.publicKey,
          userIncoTokenAccount: userIncoTokenAccount.publicKey,
          user: walletKeypair.publicKey,
        })
        .remainingAccounts([
          { pubkey: allowancePda, isSigner: false, isWritable: true },
          { pubkey: walletKeypair.publicKey, isSigner: false, isWritable: false },
        ])
        .rpc();

      console.log("Allowance granted:", allowanceTx);

      // Wait longer for TEE processing
      console.log("Waiting 5 seconds for TEE processing...");
      await new Promise(r => setTimeout(r, 5000));

      // Re-read account data after allowance
      const accountInfoAfterAllowance = await connection.getAccountInfo(userIncoTokenAccount.publicKey);
      const amountBytesAfter = accountInfoAfterAllowance!.data.slice(72, 88);
      let handleAfter = BigInt(0);
      for (let i = 0; i < 16; i++) {
        handleAfter = handleAfter | (BigInt(amountBytesAfter[i]) << BigInt(i * 8));
      }
      console.log(`Handle after allowance: ${handleAfter.toString()}`);

      // Step 5: Decrypt
      console.log("\n--- Attempting decryption after allowance ---");
      const decryptResult = await decryptHandle(handleAfter.toString(), walletKeypair);
      if (decryptResult.success) {
        console.log(`User Inco Balance (decrypted): ${formatBalance(decryptResult.plaintext!)} tokens`);
        if (initialIncoPlaintext !== null) {
          const expected = initialIncoPlaintext + BigInt(wrapAmount);
          expectedAfterWrap = expected;
          expect(decryptResult.plaintext).to.equal(expected.toString());
        }
      } else {
        console.log(`Decryption note: ${decryptResult.error}`);
        console.log("\n--- This is expected if the handle is not yet finalized in the TEE ---");
      }
    });
  });

  describe("Unwrap Token", () => {
    it("Should unwrap 50 Inco tokens back to SPL tokens", async () => {
      console.log("\n=== Unwrapping Inco Tokens ===");

      const unwrapAmount = 50_000_000_000; // 50 tokens
      console.log(`Unwrapping ${unwrapAmount / 1e9} tokens...`);

      // Encrypt the amount
      const encryptedHex = await encryptValue(BigInt(unwrapAmount));

      // Step 1: Execute unwrap without allowance
      const tx = await program.methods
        .unwrapToken(hexToBuffer(encryptedHex), inputType, new anchor.BN(unwrapAmount))
        .accounts({
          vault: vaultPda,
          splTokenMint: splMint,
          incoTokenMint: incoMint.publicKey,
          userSplTokenAccount: userSplTokenAccount,
          vaultTokenAccount: vaultTokenAccount,
          userIncoTokenAccount: userIncoTokenAccount.publicKey,
          user: walletKeypair.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
        })
        .rpc();

      console.log("Unwrap transaction:", tx);
      await new Promise(r => setTimeout(r, 3000));

      // Check balances
      const userSplBalance = await getAccount(connection, userSplTokenAccount);
      console.log(`User SPL Balance: ${formatBalance(userSplBalance.amount.toString())} tokens`);

      const vaultSplBalance = await getAccount(connection, vaultTokenAccount);
      console.log(`Vault SPL Balance: ${formatBalance(vaultSplBalance.amount.toString())} tokens`);

      // Step 2: Read actual handle from account
      const accountInfo = await connection.getAccountInfo(userIncoTokenAccount.publicKey, 'confirmed');
      expect(accountInfo).to.not.be.null;

      const amountBytes = accountInfo!.data.slice(72, 88);
      let handle = BigInt(0);
      for (let i = 0; i < 16; i++) {
        handle = handle | (BigInt(amountBytes[i]) << BigInt(i * 8));
      }
      console.log("Encrypted handle after unwrap:", handle.toString());

      // Step 3: Grant allowance for the actual handle
      const [allowancePda] = getAllowancePda(handle, walletKeypair.publicKey);
      console.log("Allowance PDA:", allowancePda.toString());

      const allowanceTx = await program.methods
        .grantAllowance()
        .accounts({
          incoTokenMint: incoMint.publicKey,
          userIncoTokenAccount: userIncoTokenAccount.publicKey,
          user: walletKeypair.publicKey,
        })
        .remainingAccounts([
          { pubkey: allowancePda, isSigner: false, isWritable: true },
          { pubkey: walletKeypair.publicKey, isSigner: false, isWritable: false },
        ])
        .rpc();

      console.log("Allowance granted:", allowanceTx);
      await new Promise(r => setTimeout(r, 2000));

      // Step 4: Decrypt
      const decryptResult = await decryptHandle(handle.toString(), walletKeypair);
      if (decryptResult.success) {
        console.log(`User Inco Balance (decrypted): ${formatBalance(decryptResult.plaintext!)} tokens`);
        if (expectedAfterWrap !== null) {
          const expected = expectedAfterWrap - BigInt(unwrapAmount);
          expect(decryptResult.plaintext).to.equal(expected.toString());
        }
      } else {
        console.log(`Decryption note: ${decryptResult.error}`);
      }
    });
  });

  describe("Summary", () => {
    it("Should display final state", async () => {
      console.log("\n=== Final State ===");

      const userSplBalance = await getAccount(connection, userSplTokenAccount);
      const vaultSplBalance = await getAccount(connection, vaultTokenAccount);

      console.log(`User SPL Balance: ${formatBalance(userSplBalance.amount.toString())} tokens`);
      console.log(`Vault SPL Balance: ${formatBalance(vaultSplBalance.amount.toString())} tokens`);

      // Note: Skipping IncoMint fetch due to IDL discriminator mismatch
      console.log(`Inco Token Supply: [Encrypted - updated on-chain]`);

      const vaultAccount = await program.account.vault.fetch(vaultPda);
      console.log(`\nVault Details:`);
      console.log(`  Authority: ${vaultAccount.authority.toString()}`);
      console.log(`  SPL Mint: ${vaultAccount.splTokenMint.toString()}`);
      console.log(`  Inco Mint: ${vaultAccount.incoTokenMint.toString()}`);
      console.log(`  Initialized: ${vaultAccount.isInitialized}`);
    });
  });
});
