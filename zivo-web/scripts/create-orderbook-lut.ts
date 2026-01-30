import {
  AddressLookupTableProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

import anchorPkg from "@coral-xyz/anchor";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

const loadEnvFile = (filePath: string) => {
  try {
    const content = readFileSync(filePath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const equalsIndex = line.indexOf("=");
      if (equalsIndex === -1) continue;
      const key = line.slice(0, equalsIndex).trim();
      let value = line.slice(equalsIndex + 1).trim();
      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // ignore missing env file
  }
};

loadEnvFile(path.resolve(scriptDir, "..", ".env.local"));

const rpcUrl =
  process.env.SOLANA_RPC_URL ??
  (process.env.NEXT_PUBLIC_HELIUS_API_KEY
    ? `https://devnet.helius-rpc.com/?api-key=${process.env.NEXT_PUBLIC_HELIUS_API_KEY}`
    : "https://api.devnet.solana.com");
const keypairPath =
  process.env.ORDERBOOK_ADMIN_KEYPAIR_PATH ??
  process.env.ADMIN_KEYPAIR_PATH ??
  process.env.KEYPAIR_PATH;
const inlineKeypair = process.env.ADMIN_MATCHER_KEYPAIR;

const loadKeypair = (filePath: string) => {
  const content = JSON.parse(readFileSync(filePath, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(content));
};

const parseInlineKeypair = (value: string) => {
  const content = JSON.parse(value) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(content));
};

const extractConstString = (source: string, name: string): string | null => {
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith(`export const ${name}`)) continue;
    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) continue;
    let value = line.slice(equalsIndex + 1).trim();
    if (value.endsWith(";")) value = value.slice(0, -1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1);
    }
  }
  return null;
};

const main = async () => {
  const connection = new Connection(rpcUrl, "confirmed");
  if (!inlineKeypair && !keypairPath) {
    throw new Error(
      "Set ADMIN_MATCHER_KEYPAIR or ORDERBOOK_ADMIN_KEYPAIR_PATH (or ADMIN_KEYPAIR_PATH).",
    );
  }

  const payer = inlineKeypair
    ? parseInlineKeypair(inlineKeypair)
    : loadKeypair(path.resolve(keypairPath as string));

  const { BorshAccountsCoder } = anchorPkg as any;
  const idlPath = path.resolve(scriptDir, "..", "idl", "zivo_orderbook_program.json");
  const idl = JSON.parse(readFileSync(idlPath, "utf8")) as any;
  const programIdString = idl.address ?? idl.metadata?.address;
  if (!programIdString) {
    throw new Error("Orderbook program id not found in IDL.");
  }

  const stateSeed =
    process.env.ORDERBOOK_STATE_SEED ?? "orderbook_market_v1";

  const mintsPath = path.resolve(scriptDir, "..", "utils", "mints.ts");
  const mintsSource = readFileSync(mintsPath, "utf8");
  const incoWsol = extractConstString(mintsSource, "INCO_WSOL_MINT");
  const incoUsdc = extractConstString(mintsSource, "INCO_USDC_MINT");
  const baseMintStr = process.env.ORDERBOOK_BASE_MINT ?? incoWsol;
  const quoteMintStr = process.env.ORDERBOOK_QUOTE_MINT ?? incoUsdc;
  if (!baseMintStr || !quoteMintStr) {
    throw new Error(
      "Missing ORDERBOOK_BASE_MINT/ORDERBOOK_QUOTE_MINT and INCO mints not found.",
    );
  }
  const baseMint = new PublicKey(baseMintStr);
  const quoteMint = new PublicKey(quoteMintStr);
  const programId = new PublicKey(programIdString);
  const [state] = PublicKey.findProgramAddressSync(
    [Buffer.from(stateSeed), baseMint.toBuffer(), quoteMint.toBuffer()],
    programId,
  );

  const accountInfo = await connection.getAccountInfo(state, "confirmed");
  if (!accountInfo) {
    throw new Error("Orderbook state account not found for the given mints.");
  }

  const accountName =
    Array.isArray(idl.accounts) &&
    (idl.accounts.find((acc: any) => acc.name === "orderbookState")?.name ??
      idl.accounts.find((acc: any) => acc.name === "OrderbookState")?.name ??
      idl.accounts[0]?.name);
  if (!accountName) {
    throw new Error("No accounts found in orderbook IDL.");
  }

  const coder = new BorshAccountsCoder(idl);
  const stateAccount = coder.decode(accountName, accountInfo.data) as any;

  const incoTokenIdlPath = path.resolve(scriptDir, "..", "idl", "inco_token.json");
  const incoTokenIdl = JSON.parse(readFileSync(incoTokenIdlPath, "utf8")) as any;
  const incoTokenProgramIdString =
    incoTokenIdl.address ?? incoTokenIdl.metadata?.address;
  const incoLightningProgramIdString =
    process.env.INCO_LIGHTNING_PROGRAM_ID ??
    "5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj";
  if (!incoTokenProgramIdString) {
    throw new Error("Inco token program id not found in idl/inco_token.json.");
  }
  const incoTokenProgramId = new PublicKey(incoTokenProgramIdString);
  const incoLightningProgramId = new PublicKey(incoLightningProgramIdString);

  const [createIx, lutAddress] = AddressLookupTableProgram.createLookupTable({
    authority: payer.publicKey,
    payer: payer.publicKey,
    recentSlot: await connection.getSlot("confirmed"),
  });

  const lutAddresses = [
    programId,
    SystemProgram.programId,
    incoTokenProgramId,
    incoLightningProgramId,
    state,
    stateAccount.incoVaultAuthority,
    stateAccount.incoBaseVault,
    stateAccount.incoQuoteVault,
    stateAccount.incoBaseMint,
    stateAccount.incoQuoteMint,
    stateAccount.admin,
    new PublicKey("Sysvar1nstructions1111111111111111111111111"),
  ].filter((value): value is PublicKey => value instanceof PublicKey);

  if (lutAddresses.length < 2) {
    throw new Error("Not enough addresses to create LUT; check state account data.");
  }

  const extendIx = AddressLookupTableProgram.extendLookupTable({
    payer: payer.publicKey,
    authority: payer.publicKey,
    lookupTable: lutAddress,
    addresses: lutAddresses,
  });

  const tx = new Transaction().add(createIx, extendIx);

  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.sign(payer);

  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(sig, "confirmed");

  console.log("LUT created:", lutAddress.toBase58());
  console.log("Transaction:", sig);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
