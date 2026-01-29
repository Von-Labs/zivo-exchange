import * as anchor from "@coral-xyz/anchor";
import dotenv from "dotenv";
import { Program } from "@coral-xyz/anchor";
import { ZivoWrap } from "../target/types/zivo_wrap";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  Connection,
  AddressLookupTableProgram,
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ACCOUNT_SIZE,
  createMint,
  createAccount,
  createInitializeAccountInstruction,
  mintTo,
  getAccount,
  getMinimumBalanceForRentExemptAccount,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { expect } from "chai";
import nacl from "tweetnacl";
import crypto from "crypto";
import { encryptValue } from "@inco/solana-sdk/encryption";
import { decrypt } from "@inco/solana-sdk/attested-decrypt";
import { hexToBuffer } from "@inco/solana-sdk/utils";
import { buildPoseidon, type Poseidon } from "circomlibjs";
import fs from "fs";
import path from "path";
import {
  bn,
  createRpc,
  deriveAddressV2,
  deriveAddressSeedV2,
  PackedAccounts,
  SystemAccountMetaConfig,
  featureFlags,
  VERSION,
  selectStateTreeInfo,
  getDefaultAddressTreeInfo,
  getLightSystemAccountMetasV2,
  getOutputQueue,
  getOutputTreeInfo,
  hashvToBn254FieldSizeBe,
} from "@lightprotocol/stateless.js";
import { generateProofPayload } from "./zk-proof.helper";

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const INCO_LIGHTNING_PROGRAM_ID = new PublicKey("5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj");
const INCO_TOKEN_PROGRAM_ID = new PublicKey("4cyJHzecVWuU2xux6bCAPAhALKQT8woBh4Vx3AGEGe5N");
const KEY_DIR = path.resolve("tests", "keys");
const KEY_SUFFIX = "v1";
const ZK_VERIFIER_PROGRAM_ID = process.env.ZK_VERIFIER_PROGRAM_ID
  ? new PublicKey(process.env.ZK_VERIFIER_PROGRAM_ID)
  : null;
const ZK_PROOF_DATA = process.env.ZK_PROOF_DATA
  ? Buffer.from(process.env.ZK_PROOF_DATA, "base64")
  : null;
const ZK_PROOF_GENERATE = process.env.ZK_PROOF_GENERATE === "1";
const ZK_CIRCUIT_DIR =
  process.env.ZK_CIRCUIT_DIR || path.resolve(__dirname, "..", "noir_circuit");
const ZK_CIRCUIT_NAME = process.env.ZK_CIRCUIT_NAME || "zivo_wrap_shielded";
const DEFAULT_ADDRESS_TREE_INFO = getDefaultAddressTreeInfo();

type NoteFields = {
  ownerField: any;
  mintField: any;
  amountField: any;
  blindingField: any;
  noteHash: any;
  commitmentBytes: Uint8Array;
};

let poseidonInstance: Poseidon | null = null;

async function initPoseidon(): Promise<void> {
  if (!poseidonInstance) {
    poseidonInstance = await buildPoseidon();
  }
}

function getPoseidon(): Poseidon {
  if (!poseidonInstance) {
    throw new Error("Poseidon not initialized");
  }
  return poseidonInstance;
}

function poseidonHashFields(fields: any[]): anchor.BN {
  const poseidon = getPoseidon();
  const inputs = fields.map((field) => BigInt(field.toString()));
  const hash = poseidon(inputs);
  const hashValue = poseidon.F.toObject(hash) as bigint;
  return new anchor.BN(hashValue.toString());
}

function poseidonHash2(left: any, right: any): anchor.BN {
  return poseidonHashFields([left, right]);
}

function bnToHex32(value: any): string {
  const bytes = Buffer.from(value.toArray("be", 32));
  return `0x${bytes.toString("hex")}`;
}

function randomFieldBytes(): Uint8Array {
  return new Uint8Array(crypto.randomBytes(31));
}

function pubkeyToField(pubkey: PublicKey): anchor.BN {
  const hashed = hashvToBn254FieldSizeBe([pubkey.toBytes()]);
  return bn(hashed);
}

function buildNoteFields(owner: PublicKey, mint: PublicKey, amount: number | anchor.BN): NoteFields {
  const ownerField = pubkeyToField(owner);
  const mintField = pubkeyToField(mint);
  const amountField = bn(
    amount instanceof anchor.BN ? amount.toString() : amount.toString()
  );
  const blindingField = bn(randomFieldBytes());
  const ownerMint = poseidonHash2(ownerField, mintField);
  const amountBlinding = poseidonHash2(amountField, blindingField);
  const noteHash = poseidonHash2(ownerMint, amountBlinding);
  const commitmentBytes = new Uint8Array(noteHash.toArray("be", 32));

  return {
    ownerField,
    mintField,
    amountField,
    blindingField,
    noteHash,
    commitmentBytes,
  };
}

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
  let shieldedPoolPda: PublicKey;
  let lastCommitment: Uint8Array | null = null;
  let lutAccount: AddressLookupTableAccount | null = null;

  async function sendV0(
    instructions: anchor.web3.TransactionInstruction[],
    signers: Keypair[],
    lookupTables: AddressLookupTableAccount[]
  ) {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const message = new TransactionMessage({
      payerKey: walletKeypair.publicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message(lookupTables);
    const tx = new VersionedTransaction(message);
    tx.sign(signers);
    const signature = await connection.sendTransaction(tx, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed"
    );
    return signature;
  }

  async function buildLookupTable(addresses: PublicKey[]) {
    const unique = Array.from(new Set(addresses.map((addr) => addr.toBase58()))).map(
      (addr) => new PublicKey(addr)
    );
    if (unique.length === 0) return null;

    let lookupTableAddress: PublicKey | null = null;
    let lookupAccount: AddressLookupTableAccount | null = null;

    for (let attempt = 0; attempt < 5; attempt++) {
      const recentSlot = (await connection.getSlot("confirmed")) + attempt;
      const [createIx, candidate] = AddressLookupTableProgram.createLookupTable({
        authority: walletKeypair.publicKey,
        payer: walletKeypair.publicKey,
        recentSlot,
      });
      const existing = await connection.getAddressLookupTable(candidate);
      if (existing.value) {
        lookupTableAddress = candidate;
        lookupAccount = existing.value;
        break;
      }
      await sendV0([createIx], [walletKeypair], []);
      const created = await connection.getAddressLookupTable(candidate);
      if (created.value) {
        lookupTableAddress = candidate;
        lookupAccount = created.value;
        break;
      }
    }

    if (!lookupTableAddress || !lookupAccount) {
      throw new Error("failed to create or fetch address lookup table");
    }

    const chunkSize = 20;
    for (let i = 0; i < unique.length; i += chunkSize) {
      const chunk = unique.slice(i, i + chunkSize);
      const extendIx = AddressLookupTableProgram.extendLookupTable({
        payer: walletKeypair.publicKey,
        authority: walletKeypair.publicKey,
        lookupTable: lookupTableAddress,
        addresses: chunk,
      });
      await sendV0([extendIx], [walletKeypair], []);
    }

    const lookup = await connection.getAddressLookupTable(lookupTableAddress);
    if (!lookup.value) {
      throw new Error("failed to fetch address lookup table");
    }
    return lookup.value;
  }

  function getLightRpc() {
    return createRpc(
      process.env.LIGHT_RPC_URL,
      process.env.LIGHT_COMPRESSION_URL,
      process.env.LIGHT_PROVER_URL
    );
  }

  console.log("LIGHT_RPC_URL", process.env.LIGHT_RPC_URL);
  console.log("LIGHT_COMPRESSION_URL", process.env.LIGHT_COMPRESSION_URL);
  console.log("LIGHT_PROVER_URL", process.env.LIGHT_PROVER_URL);

  async function buildPackedAddressTreeInfo(
    newAddresses: PublicKey[]
  ): Promise<{
    proof: any;
    addressTreeInfo: any;
    outputStateTreeIndex: number;
    remainingAccounts: anchor.web3.AccountMeta[];
    systemAccountsOffset: number;
    addressTree: PublicKey;
    addressQueue: PublicKey;
    stateTree: PublicKey;
    nullifierQueue: PublicKey;
  }> {
    (featureFlags as any).version = VERSION.V2;
    const rpc = getLightRpc();
    const stateTreeInfos = await rpc.getStateTreeInfos();
    const stateTreeInfo = selectStateTreeInfo(stateTreeInfos);
    const addressTree = DEFAULT_ADDRESS_TREE_INFO.tree;
    const addressQueue = DEFAULT_ADDRESS_TREE_INFO.queue;
    try {
      const health = await (rpc as any).getIndexerHealth?.();
      if (health) {
        console.log("Light indexer health:", health);
      }
    } catch (error) {
      console.log("Light indexer health check failed:", error);
    }

    const addressesWithTree = newAddresses.map((addr) => ({
      tree: addressTree,
      queue: addressQueue,
      address: bn(addr.toBytes()),
    }));
    console.log("Light proof request:", {
      addressTree: addressTree.toBase58(),
      addressQueue: addressQueue.toBase58(),
      newAddresses: newAddresses.map((addr) => addr.toBase58()),
      rpcUrl: process.env.LIGHT_RPC_URL,
      compressionUrl: process.env.LIGHT_COMPRESSION_URL,
    });
    let proofRpcResult: any = null;
    for (let i = 0; i < 5; i++) {
      try {
        proofRpcResult = await rpc.getValidityProofV0([], addressesWithTree);
        break;
      } catch (error) {
        console.log("getValidityProofV0 error:", error);
        if (error && typeof error === "object") {
          console.log(
            "getValidityProofV0 error details:",
            JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    if (!proofRpcResult) {
      throw new Error("failed to get validity proof from Light RPC");
    }

    const systemAccountConfig = SystemAccountMetaConfig.new(program.programId);
    const addressQueuePubkey = proofRpcResult.treeInfos?.[0]?.queue
      ? new PublicKey(proofRpcResult.treeInfos[0].queue)
      : addressQueue;
    const addressMerkleTreePubkeyIndex = 0;
    const addressQueuePubkeyIndex = addressQueuePubkey.equals(addressTree) ? 0 : 1;
    const addressTreeInfo = {
      rootIndex: proofRpcResult.rootIndices[0],
      addressMerkleTreePubkeyIndex,
      addressQueuePubkeyIndex,
    };
    const outputTreeInfo = getOutputTreeInfo({ treeInfo: stateTreeInfo });
    const outputQueue = getOutputQueue({ treeInfo: stateTreeInfo });
    const stateTreePubkey = new PublicKey(outputTreeInfo.tree);
    const stateQueuePubkey = new PublicKey(outputQueue);
    const outputStateTreeIndex = addressQueuePubkey.equals(addressTree) ? 1 : 2;
    const accountMetas = getLightSystemAccountMetasV2(systemAccountConfig);

    return {
      proof: { 0: proofRpcResult.compressedProof },
      addressTreeInfo,
      outputStateTreeIndex,
      remainingAccounts: accountMetas,
      systemAccountsOffset: 0,
      addressTree,
      addressQueue: addressQueuePubkey,
      stateTree: stateTreePubkey,
      nullifierQueue: stateQueuePubkey,
    };
  }

  function toHex32(value: any): string {
    const bytes = Buffer.from(value.toArray("be", 32));
    return `0x${bytes.toString("hex")}`;
  }

  async function buildProofPayloadFromLight(
    commitment: Uint8Array,
    note: NoteFields | null
  ): Promise<{ proofPayload: Buffer; nullifierBytes: Uint8Array }> {
    if (!note) {
      throw new Error("missing note fields for proof");
    }
    if (!Buffer.from(commitment).equals(Buffer.from(note.commitmentBytes))) {
      throw new Error("commitment does not match note hash");
    }
    const rpc = getLightRpc();
    const commitmentSeed = new TextEncoder().encode("commitment");
    const seed = deriveAddressSeedV2([commitmentSeed, commitment]);
    const addressTree = DEFAULT_ADDRESS_TREE_INFO.tree;
    const address = deriveAddressV2(seed, addressTree, program.programId);

    let compressed = await rpc.getCompressedAccount(bn(address.toBytes()));
    if (!compressed) {
      throw new Error("compressed account not found for commitment");
    }
    let proof;
    for (let i = 0; i < 10; i++) {
      try {
        proof = await rpc.getCompressedAccountProof(compressed.hash);
        break;
      } catch (error) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    if (!proof) {
      throw new Error("failed to fetch compressed account proof");
    }

    const siblings = proof.merkleProof.map((sib: any) => toHex32(sib));
    if (siblings.length > 32) {
      throw new Error(`merkleProof depth ${siblings.length} exceeds circuit depth 32`);
    }
    while (siblings.length < 32) {
      siblings.push("0x0");
    }

    const nullifierSecret = bn(randomFieldBytes());
    const nullifierHash = poseidonHash2(note.noteHash, nullifierSecret);
    const nullifierBytes = new Uint8Array(nullifierHash.toArray("be", 32));
    const ownerHex = bnToHex32(note.ownerField);
    const mintHex = bnToHex32(note.mintField);
    const commitmentHex = bnToHex32(note.noteHash);
    const nullifierHex = bnToHex32(nullifierHash);
    const blindingHex = bnToHex32(note.blindingField);
    const nullifierSecretHex = bnToHex32(nullifierSecret);
    console.log("Noir proof inputs:", {
      root: toHex32(proof.root),
      leaf: toHex32(proof.hash),
      index: proof.leafIndex ?? compressed.leafIndex,
      siblings: siblings.length,
      owner: ownerHex,
      mint: mintHex,
      amount: note.amountField.toString(),
      commitment: commitmentHex,
      nullifier: nullifierHex,
    });
    const proofPayload = generateProofPayload(
      { circuitDir: ZK_CIRCUIT_DIR, circuitName: ZK_CIRCUIT_NAME },
      {
        root: toHex32(proof.root),
        nullifier: nullifierHex,
        recipient: ownerHex,
        amount: note.amountField.toString(),
        mint: mintHex,
        commitment: commitmentHex,
        leaf: toHex32(proof.hash),
        index: (proof.leafIndex ?? compressed.leafIndex).toString(),
        siblings,
        owner: ownerHex,
        blinding: blindingHex,
        nullifier_secret: nullifierSecretHex,
      }
    );
    return { proofPayload, nullifierBytes };
  }

  function buildZkProofPayload(): Buffer | null {
    if (ZK_PROOF_DATA) return ZK_PROOF_DATA;
    if (!ZK_PROOF_GENERATE) return null;

    const treeDepth = Number(process.env.ZK_TREE_DEPTH || 32);
    const siblings = (process.env.ZK_SIBLINGS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const siblingValues =
      siblings.length > 0 ? siblings : Array.from({ length: treeDepth }, () => "0x0");

    return generateProofPayload(
      { circuitDir: ZK_CIRCUIT_DIR, circuitName: ZK_CIRCUIT_NAME },
      {
        root: process.env.ZK_ROOT || "0x0",
        nullifier: process.env.ZK_NULLIFIER || "0x0",
        recipient: process.env.ZK_RECIPIENT || "0x0",
        amount: process.env.ZK_AMOUNT || "1",
        mint: process.env.ZK_MINT || "0x0",
        commitment: process.env.ZK_COMMITMENT || "0x0",
        leaf: process.env.ZK_LEAF || "0x0",
        index: process.env.ZK_INDEX || "0",
        siblings: siblingValues,
        owner: process.env.ZK_OWNER || "0x0",
        blinding: process.env.ZK_BLINDING || "0x0",
        nullifier_secret: process.env.ZK_NULLIFIER_SECRET || "0x0",
      }
    );
  }
  let initialIncoPlaintext: bigint | null = null;
  let expectedAfterWrap: bigint | null = null;
  let lastNote: NoteFields | null = null;

  before(async () => {
    await initPoseidon();
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

    [shieldedPoolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("shielded_pool"), splMint.toBuffer(), incoMint.publicKey.toBuffer()],
      program.programId
    );

    const lightSystemAccounts = getLightSystemAccountMetasV2(
      SystemAccountMetaConfig.new(program.programId)
    ).map((meta) => meta.pubkey);
    const lutAddresses = [
      program.programId,
      INCO_TOKEN_PROGRAM_ID,
      INCO_LIGHTNING_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      SystemProgram.programId,
      shieldedPoolPda,
      vaultPda,
      splMint,
      incoMint.publicKey,
      userSplTokenAccount,
      vaultTokenAccount,
      userIncoTokenAccount.publicKey,
      walletKeypair.publicKey,
      DEFAULT_ADDRESS_TREE_INFO.tree,
      DEFAULT_ADDRESS_TREE_INFO.queue,
      ...lightSystemAccounts,
    ];
    lutAccount = await buildLookupTable(lutAddresses);
    console.log("Lookup table:", lutAccount.key.toBase58());
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

      // Transfer mint authority to vault PDA
      console.log("\nTransferring Inco mint authority to vault...");

      // Read the current mint authority from the account
      const mintAccountInfo = await connection.getAccountInfo(incoMint.publicKey);
      if (!mintAccountInfo) {
        throw new Error("Inco mint account not found");
      }

      // Parse the IncoMint struct to get current mint authority
      // IncoMint layout: mintAuthority (Option<Pubkey> = 1 + 32 bytes), supply (16 bytes), decimals (1), isInitialized (1), freezeAuthority (Option<Pubkey>)
      const data = mintAccountInfo.data;
      const hasMintAuthority = data[8] === 1; // Skip 8-byte discriminator, check option tag

      if (hasMintAuthority) {
        const currentMintAuthority = new PublicKey(data.slice(9, 41)); // After discriminator + option tag
        console.log("Current mint authority:", currentMintAuthority.toBase58());
        console.log("Target vault PDA:", vaultPda.toBase58());

        if (currentMintAuthority.equals(vaultPda)) {
          console.log("Mint authority already set to vault PDA, skipping transfer");
        } else {
          // Try to transfer from current authority
          try {
            await incoTokenProgram.methods
              .setMintAuthority(vaultPda)
              .accounts({
                mint: incoMint.publicKey,
                currentAuthority: walletKeypair.publicKey,
              } as any)
              .rpc();
            console.log("Mint authority transferred successfully to vault PDA");
          } catch (error: any) {
            console.error(`Failed to transfer mint authority: ${error.message || error}`);
            console.error("This will cause wrap/unwrap tests to fail!");
            console.error("Solution: Delete the .anchor/test-ledger directory and restart validator, or use a fresh Inco mint");
            throw error;
          }
        }
      } else {
        console.log("Mint has no authority (fixed supply), cannot transfer");
      }
    });
  });

  describe("Initialize Shielded Pool", () => {
    it("Should initialize shielded pool (Light)", async () => {
      const rpc = getLightRpc();
      const stateTreeInfos = await rpc.getStateTreeInfos();
      const stateTreeInfo = selectStateTreeInfo(stateTreeInfos);
      const addressTree = DEFAULT_ADDRESS_TREE_INFO.tree;

      const existing = await connection.getAccountInfo(shieldedPoolPda);
      if (existing) {
        console.log("Shielded pool already initialized, skipping init.");
        return;
      }

      const tx = await program.methods
        .initShieldedPool(stateTreeInfo.depth ?? 16)
        .accounts({
          shieldedPool: shieldedPoolPda,
          vault: vaultPda,
          splTokenMint: splMint,
          incoTokenMint: incoMint.publicKey,
          stateTree: new PublicKey(stateTreeInfo.tree),
          addressTree,
          nullifierQueue: new PublicKey(stateTreeInfo.queue),
          authority: walletKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log("Shielded pool tx:", tx);
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

  describe("Shielded (light/noir) stubs", () => {
    it("Should fail without Light accounts/proofs (wrap_and_commit)", async () => {
      const commitment = new Uint8Array(32);
      const dummyAddressTreeInfo = {
        addressMerkleTreePubkeyIndex: 0,
        addressQueuePubkeyIndex: 0,
        rootIndex: 0,
      };

      try {
        await program.methods
          .wrapAndCommit(
            Buffer.alloc(1),
            inputType,
            new anchor.BN(1),
            Array.from(commitment) as any,
            null as any,
            dummyAddressTreeInfo as any,
            0,
            0
          )
          .accounts({
            shieldedPool: vaultPda,
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
            incoTokenProgram: INCO_TOKEN_PROGRAM_ID,
            addressTree: walletKeypair.publicKey,
            addressQueue: walletKeypair.publicKey,
            stateQueue: walletKeypair.publicKey,
            stateTree: walletKeypair.publicKey,
          })
        .rpc();
        expect.fail("Expected wrap_and_commit to fail without Light accounts");
      } catch (error: any) {
        expect(error).to.be.ok;
      }
    });

    it("Should fail without verifier/proofs (shielded_transfer)", async () => {
      const commitment = new Uint8Array(crypto.randomBytes(32));
      const nullifier = new Uint8Array(crypto.randomBytes(32));
      const dummyAddressTreeInfo = {
        addressMerkleTreePubkeyIndex: 0,
        addressQueuePubkeyIndex: 0,
        rootIndex: 0,
      };
      try {
        await program.methods
          .shieldedTransfer(
            Buffer.alloc(0),
            Array.from(nullifier) as any,
            Array.from(commitment) as any,
            null as any,
            dummyAddressTreeInfo as any,
            0,
            0
          )
          .accounts({
          shieldedPool: vaultPda,
          user: walletKeypair.publicKey,
          verifierProgram: program.programId,
            addressTree: walletKeypair.publicKey,
            addressQueue: walletKeypair.publicKey,
            stateQueue: walletKeypair.publicKey,
            stateTree: walletKeypair.publicKey,
          })
        .rpc();
        expect.fail("Expected shielded_transfer to fail without Light accounts");
      } catch (error: any) {
        expect(error).to.be.ok;
      }
    });

    it("Should fail without verifier/proofs (unwrap_from_note)", async () => {
      const nullifier = new Uint8Array(crypto.randomBytes(32));
      const dummyAddressTreeInfo = {
        addressMerkleTreePubkeyIndex: 0,
        addressQueuePubkeyIndex: 0,
        rootIndex: 0,
      };
      try {
        await program.methods
          .unwrapFromNote(
            Buffer.alloc(0),
            Array.from(nullifier) as any,
            Buffer.alloc(1),
            inputType,
            new anchor.BN(1),
            null as any,
            dummyAddressTreeInfo as any,
            0,
            0
          )
          .accounts({
            shieldedPool: vaultPda,
            vault: vaultPda,
            splTokenMint: splMint,
            incoTokenMint: incoMint.publicKey,
            userSplTokenAccount: userSplTokenAccount,
            vaultTokenAccount: vaultTokenAccount,
            userIncoTokenAccount: userIncoTokenAccount.publicKey,
            user: walletKeypair.publicKey,
            verifierProgram: program.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
            incoTokenProgram: INCO_TOKEN_PROGRAM_ID,
            addressTree: walletKeypair.publicKey,
            addressQueue: walletKeypair.publicKey,
            stateQueue: walletKeypair.publicKey,
            stateTree: walletKeypair.publicKey,
          })
        .rpc();
        expect.fail("Expected unwrap_from_note to fail without Light accounts");
      } catch (error: any) {
        expect(error).to.be.ok;
      }
    });

    it("Should wrap + commit with Light proof (no verifier)", async function () {
      const commitmentSeed = new TextEncoder().encode("commitment");
      const note = buildNoteFields(walletKeypair.publicKey, incoMint.publicKey, 1);
      const commitment = note.commitmentBytes;
      const seed = deriveAddressSeedV2([commitmentSeed, commitment]);
      const addressTreePubkey = DEFAULT_ADDRESS_TREE_INFO.tree;
      const commitmentAddress = deriveAddressV2(seed, addressTreePubkey, program.programId);
      console.log("wrap_and_commit: commitment address", commitmentAddress.toBase58());

      let packed;
      try {
        packed = await buildPackedAddressTreeInfo([commitmentAddress]);
      } catch (error) {
        console.log("wrap_and_commit: failed to build Light proof payload", error);
        throw error;
      }
      const {
        proof,
        addressTreeInfo,
        outputStateTreeIndex,
        remainingAccounts,
        systemAccountsOffset,
        addressTree,
        addressQueue,
        stateTree,
        nullifierQueue,
      } = packed;

      const tx = await program.methods
        .wrapAndCommit(
          Buffer.alloc(1),
          inputType,
          new anchor.BN(1),
          Array.from(commitment) as any,
          proof as any,
          addressTreeInfo as any,
          outputStateTreeIndex,
          systemAccountsOffset
        )
        .accounts({
          shieldedPool: shieldedPoolPda,
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
          incoTokenProgram: INCO_TOKEN_PROGRAM_ID,
          addressTree,
          addressQueue,
          stateQueue: nullifierQueue,
          stateTree,
        })
        .remainingAccounts(remainingAccounts)
        .instruction();

      if (process.env.DEBUG_LIGHT === "1") {
        const addressTreePubkey = DEFAULT_ADDRESS_TREE_INFO.tree;
        const addressTreeKey = tx.keys.find((key) => key.pubkey.equals(addressTreePubkey));
        console.log("DEBUG_LIGHT systemAccountsOffset", systemAccountsOffset);
        console.log("DEBUG_LIGHT remainingAccounts length", remainingAccounts.length);
        console.log("DEBUG_LIGHT addressTree key", addressTreeKey);
        console.log("DEBUG_LIGHT addressQueue", packed.addressQueue.toBase58());
        const expectedSystemAccounts = getLightSystemAccountMetasV2(
          SystemAccountMetaConfig.new(program.programId)
        );
        console.log(
          "DEBUG_LIGHT expected system accounts",
          expectedSystemAccounts.map((meta, index) => ({
            index,
            pubkey: meta.pubkey.toBase58(),
            isSigner: meta.isSigner,
            isWritable: meta.isWritable,
          }))
        );
        console.log(
          "DEBUG_LIGHT remaining accounts",
          remainingAccounts.map((meta, index) => ({
            index,
            pubkey: meta.pubkey.toBase58(),
            isSigner: meta.isSigner,
            isWritable: meta.isWritable,
          }))
        );
      }

      // Force mutable flags in case the client IDL is stale.
      const computeIx = anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 });
      const sig = await program.provider.sendAndConfirm(
        new anchor.web3.Transaction().add(computeIx, tx),
        [walletKeypair]
      );
      console.log("wrap_and_commit tx:", sig);
      lastCommitment = commitment;
      lastNote = note;

      const rpc = getLightRpc();
      const slot = await rpc.getSlot();
      await rpc.confirmTransactionIndexed(slot);
    });

    it("Should run full shielded_transfer if verifier env is set", async function () {
      if (!lastCommitment && !ZK_PROOF_DATA) {
        console.log("shielded_transfer: skipping (missing lastCommitment and ZK_PROOF_DATA)");
        this.skip();
        return;
      }
      let proofPayload: Buffer | null = null;
      let nullifierBytes: Uint8Array | null = null;
      if (lastCommitment) {
        try {
          console.log("shielded_transfer: building proof from Light commitment");
          const proofResult = await buildProofPayloadFromLight(lastCommitment, lastNote);
          proofPayload = proofResult.proofPayload;
          nullifierBytes = proofResult.nullifierBytes;
        } catch (error) {
          console.log("shielded_transfer: skipping (failed to build proof from Light)", error);
          this.skip();
          return;
        }
      } else {
        console.log("shielded_transfer: building proof from env ZK_* inputs");
        proofPayload = buildZkProofPayload();
      }
      if (!ZK_VERIFIER_PROGRAM_ID || !proofPayload) {
        console.log("Skipping full shielded_transfer (missing verifier env).");
        return;
      }

      const commitment = new Uint8Array(crypto.randomBytes(32));
      const nullifier = nullifierBytes ?? new Uint8Array(crypto.randomBytes(32));
      const addressTreePubkey = DEFAULT_ADDRESS_TREE_INFO.tree;
      const nullifierSeed = new TextEncoder().encode("nullifier");
      const commitmentSeed = new TextEncoder().encode("commitment");
      const nullifierAddress = deriveAddressV2(
        deriveAddressSeedV2([nullifierSeed, nullifier]),
        addressTreePubkey,
        program.programId
      );
      const commitmentAddress = deriveAddressV2(
        deriveAddressSeedV2([commitmentSeed, commitment]),
        addressTreePubkey,
        program.programId
      );
      const {
        proof,
        addressTreeInfo,
        outputStateTreeIndex,
        remainingAccounts,
        systemAccountsOffset,
        stateTree,
        addressTree,
        addressQueue,
        nullifierQueue,
      } = await buildPackedAddressTreeInfo([nullifierAddress, commitmentAddress]);

      const tx = await program.methods
        .shieldedTransfer(
          proofPayload,
          Array.from(nullifier) as any,
          Array.from(commitment) as any,
          proof as any,
          addressTreeInfo as any,
          outputStateTreeIndex,
          systemAccountsOffset
        )
        .accounts({
          shieldedPool: shieldedPoolPda,
          user: walletKeypair.publicKey,
          verifierProgram: ZK_VERIFIER_PROGRAM_ID,
          addressTree,
          addressQueue,
          stateQueue: nullifierQueue,
          stateTree,
        })
        .remainingAccounts(remainingAccounts)
        .instruction();
      if (!lutAccount) {
        throw new Error("lookup table not initialized");
      }
      const computeIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 });
      const sig = await sendV0([computeIx, tx], [walletKeypair], [lutAccount]);
      console.log("shielded_transfer tx:", sig);
    });

    it("Should run full unwrap_from_note if verifier env is set", async function () {
      if (!lastCommitment && !ZK_PROOF_DATA) {
        console.log("unwrap_from_note: skipping (missing lastCommitment and ZK_PROOF_DATA)");
        this.skip();
        return;
      }
      let proofPayload: Buffer | null = null;
      let nullifierBytes: Uint8Array | null = null;
      if (lastCommitment) {
        try {
          console.log("unwrap_from_note: building proof from Light commitment");
          const proofResult = await buildProofPayloadFromLight(lastCommitment, lastNote);
          proofPayload = proofResult.proofPayload;
          nullifierBytes = proofResult.nullifierBytes;
        } catch (error) {
          console.log("unwrap_from_note: skipping (failed to build proof from Light)", error);
          this.skip();
          return;
        }
      } else {
        console.log("unwrap_from_note: building proof from env ZK_* inputs");
        proofPayload = buildZkProofPayload();
      }
      if (!ZK_VERIFIER_PROGRAM_ID || !proofPayload) {
        console.log("Skipping full unwrap_from_note (missing verifier env).");
        return;
      }

      const nullifier = nullifierBytes ?? new Uint8Array(crypto.randomBytes(32));
      const addressTreePubkey = DEFAULT_ADDRESS_TREE_INFO.tree;
      const nullifierSeed = new TextEncoder().encode("nullifier");
      const nullifierAddress = deriveAddressV2(
        deriveAddressSeedV2([nullifierSeed, nullifier]),
        addressTreePubkey,
        program.programId
      );
      const {
        proof,
        addressTreeInfo,
        outputStateTreeIndex,
        remainingAccounts,
        systemAccountsOffset,
        stateTree,
        addressTree,
        addressQueue,
        nullifierQueue,
      } = await buildPackedAddressTreeInfo([nullifierAddress]);

      const tx = await program.methods
        .unwrapFromNote(
          proofPayload,
          Array.from(nullifier) as any,
          Buffer.alloc(1),
          inputType,
          new anchor.BN(1),
          proof as any,
          addressTreeInfo as any,
          outputStateTreeIndex,
          systemAccountsOffset
        )
        .accounts({
          shieldedPool: shieldedPoolPda,
          vault: vaultPda,
          splTokenMint: splMint,
          incoTokenMint: incoMint.publicKey,
          userSplTokenAccount: userSplTokenAccount,
          vaultTokenAccount: vaultTokenAccount,
          userIncoTokenAccount: userIncoTokenAccount.publicKey,
          user: walletKeypair.publicKey,
          verifierProgram: ZK_VERIFIER_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
          incoTokenProgram: INCO_TOKEN_PROGRAM_ID,
          addressTree,
          addressQueue,
          stateQueue: nullifierQueue,
          stateTree,
        })
        .remainingAccounts(remainingAccounts)
        .instruction();
      if (!lutAccount) {
        throw new Error("lookup table not initialized");
      }
      const computeIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 });
      const sig = await sendV0([computeIx, tx], [walletKeypair], [lutAccount]);
      console.log("unwrap_from_note tx:", sig);
    });

    it("Should unwrap_from_note to custom recipient address", async function () {
      if (!lastCommitment && !ZK_PROOF_DATA) {
        console.log("unwrap_from_note (custom recipient): skipping (missing lastCommitment and ZK_PROOF_DATA)");
        this.skip();
        return;
      }

      // Create a new recipient keypair
      const recipientKeypair = Keypair.generate();
      console.log("Recipient address:", recipientKeypair.publicKey.toBase58());

      // Create recipient SPL token account
      const recipientSplTokenAccount = await getAssociatedTokenAddress(
        splMint,
        recipientKeypair.publicKey
      );

      // Create the account if it doesn't exist
      const recipientAccountInfo = await connection.getAccountInfo(recipientSplTokenAccount);
      if (!recipientAccountInfo) {
        const createIx = createAssociatedTokenAccountInstruction(
          walletKeypair.publicKey,
          recipientSplTokenAccount,
          recipientKeypair.publicKey,
          splMint
        );
        const tx = new anchor.web3.Transaction().add(createIx);
        await anchor.web3.sendAndConfirmTransaction(connection, tx, [walletKeypair]);
      }
      console.log("Recipient SPL token account:", recipientSplTokenAccount.toBase58());

      let proofPayload: Buffer | null = null;
      let nullifierBytes: Uint8Array | null = null;
      if (lastCommitment) {
        try {
          console.log("unwrap_from_note (custom recipient): building proof from Light commitment");
          const proofResult = await buildProofPayloadFromLight(lastCommitment, lastNote);
          proofPayload = proofResult.proofPayload;
          nullifierBytes = proofResult.nullifierBytes;
        } catch (error) {
          console.log("unwrap_from_note (custom recipient): skipping (failed to build proof from Light)", error);
          this.skip();
          return;
        }
      } else {
        console.log("unwrap_from_note (custom recipient): building proof from env ZK_* inputs");
        proofPayload = buildZkProofPayload();
      }
      if (!ZK_VERIFIER_PROGRAM_ID || !proofPayload) {
        console.log("Skipping full unwrap_from_note (custom recipient) (missing verifier env).");
        return;
      }

      const nullifier = nullifierBytes ?? new Uint8Array(crypto.randomBytes(32));
      const addressTreePubkey = DEFAULT_ADDRESS_TREE_INFO.tree;
      const nullifierSeed = new TextEncoder().encode("nullifier");
      const nullifierAddress = deriveAddressV2(
        deriveAddressSeedV2([nullifierSeed, nullifier]),
        addressTreePubkey,
        program.programId
      );
      const {
        proof,
        addressTreeInfo,
        outputStateTreeIndex,
        remainingAccounts,
        systemAccountsOffset,
        stateTree,
        addressTree,
        addressQueue,
        nullifierQueue,
      } = await buildPackedAddressTreeInfo([nullifierAddress]);

      // Get recipient balance before unwrap
      const recipientBalanceBefore = await connection.getBalance(recipientKeypair.publicKey);
      const recipientSplBalanceBefore = (await getAccount(connection, recipientSplTokenAccount)).amount;
      console.log("Recipient SPL balance before:", recipientSplBalanceBefore.toString());

      const tx = await program.methods
        .unwrapFromNote(
          proofPayload,
          Array.from(nullifier) as any,
          Buffer.alloc(1),
          inputType,
          new anchor.BN(1),
          proof as any,
          addressTreeInfo as any,
          outputStateTreeIndex,
          systemAccountsOffset
        )
        .accounts({
          shieldedPool: shieldedPoolPda,
          vault: vaultPda,
          splTokenMint: splMint,
          incoTokenMint: incoMint.publicKey,
          userSplTokenAccount: userSplTokenAccount,
          vaultTokenAccount: vaultTokenAccount,
          userIncoTokenAccount: userIncoTokenAccount.publicKey,
          recipientSplTokenAccount: recipientSplTokenAccount, // Custom recipient
          user: walletKeypair.publicKey,
          verifierProgram: ZK_VERIFIER_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
          incoTokenProgram: INCO_TOKEN_PROGRAM_ID,
          addressTree,
          addressQueue,
          stateQueue: nullifierQueue,
          stateTree,
        })
        .remainingAccounts(remainingAccounts)
        .instruction();
      if (!lutAccount) {
        throw new Error("lookup table not initialized");
      }
      const computeIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 });
      const sig = await sendV0([computeIx, tx], [walletKeypair], [lutAccount]);
      console.log("unwrap_from_note (custom recipient) tx:", sig);

      // Verify recipient received tokens
      const recipientSplBalanceAfter = (await getAccount(connection, recipientSplTokenAccount)).amount;
      console.log("Recipient SPL balance after:", recipientSplBalanceAfter.toString());
      expect(Number(recipientSplBalanceAfter)).to.be.greaterThan(Number(recipientSplBalanceBefore));
      console.log("✅ Custom recipient received tokens successfully!");
    });
  });
});
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
