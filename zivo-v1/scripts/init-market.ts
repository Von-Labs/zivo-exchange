import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import fs from "fs";
import path from "path";

import type { ZivoOrderbookProgram } from "../target/types/zivo_orderbook_program";

const INCO_LIGHTNING_PROGRAM_ID = new PublicKey(
  "5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj",
);
const INCO_TOKEN_PROGRAM_ID = new PublicKey(
  "4cyJHzecVWuU2xux6bCAPAhALKQT8woBh4Vx3AGEGe5N",
);

const KEY_DIR = path.resolve("scripts", "keys");

function loadOrCreateKeypair(fileName: string): Keypair {
  fs.mkdirSync(KEY_DIR, { recursive: true });
  const filePath = path.join(KEY_DIR, fileName);
  if (fs.existsSync(filePath)) {
    const secret = JSON.parse(fs.readFileSync(filePath, "utf8")) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(secret));
  }
  const kp = Keypair.generate();
  fs.writeFileSync(filePath, JSON.stringify(Array.from(kp.secretKey)));
  return kp;
}

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1];
}

function loadKeypairFromFile(filePath: string): Keypair {
  const secret = JSON.parse(fs.readFileSync(filePath, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function loadIncoIdl(): anchor.Idl {
  const idlPath = path.resolve(__dirname, "..", "..", "zivo-web", "idl", "inco_token.json");
  const raw = fs.readFileSync(idlPath, "utf8");
  return JSON.parse(raw) as anchor.Idl;
}

async function main(): Promise<void> {
  const baseMintArg = getArg("--base-mint");
  const quoteMintArg = getArg("--quote-mint");
  if (!baseMintArg || !quoteMintArg) {
    throw new Error(
      "Missing --base-mint or --quote-mint. Example: --base-mint <PK> --quote-mint <PK>",
    );
  }

  const adminArg = getArg("--admin");
  const adminKeypairPath = getArg("--admin-keypair");
  const requireAttestation = getArg("--require-attestation") === "true";

  const rpcUrl =
    getArg("--rpc") || process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com";
  const walletPath = getArg("--wallet") || process.env.ANCHOR_WALLET;
  if (!walletPath) {
    throw new Error("Missing wallet path. Set --wallet or ANCHOR_WALLET.");
  }
  const walletKeypair = loadKeypairFromFile(walletPath);
  const provider = new anchor.AnchorProvider(
    new Connection(rpcUrl, "confirmed"),
    new anchor.Wallet(walletKeypair),
    { commitment: "confirmed" },
  );
  anchor.setProvider(provider);

  const program = anchor.workspace
    .ZivoOrderbookProgram as anchor.Program<ZivoOrderbookProgram>;
  const incoIdl = loadIncoIdl();
  if (!("address" in incoIdl) || !incoIdl.address) {
    (incoIdl as anchor.Idl).address = INCO_TOKEN_PROGRAM_ID.toBase58();
  }
  const incoProgram = new anchor.Program(incoIdl, provider);

  const payer = walletKeypair;
  let admin = adminArg ? new PublicKey(adminArg) : payer.publicKey;
  let adminSigner: Keypair | null = null;
  if (!adminArg) {
    adminSigner = payer;
  } else if (admin.equals(payer.publicKey)) {
    adminSigner = payer;
  } else if (adminKeypairPath) {
    adminSigner = loadKeypairFromFile(adminKeypairPath);
    admin = adminSigner.publicKey;
  } else {
    throw new Error(
      "Admin is not the payer. Provide --admin-keypair so the admin can sign initialize.",
    );
  }

  const baseMint = new PublicKey(baseMintArg);
  const quoteMint = new PublicKey(quoteMintArg);

  const [statePda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("orderbook_market_v1"),
      baseMint.toBuffer(),
      quoteMint.toBuffer(),
    ],
    program.programId,
  );
  const [incoVaultAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("inco_vault_authority_v12"), statePda.toBuffer()],
    program.programId,
  );

  const baseVault = loadOrCreateKeypair("base_vault.json");
  const quoteVault = loadOrCreateKeypair("quote_vault.json");

  const baseMintInfo = await provider.connection.getAccountInfo(baseMint);
  const quoteMintInfo = await provider.connection.getAccountInfo(quoteMint);
  if (!baseMintInfo || !quoteMintInfo) {
    throw new Error("Base or quote mint not found on cluster.");
  }

  const ensureIncoAccount = async (
    account: Keypair,
    mint: PublicKey,
    owner: PublicKey,
  ): Promise<void> => {
    const info = await provider.connection.getAccountInfo(account.publicKey);
    if (info) {
      try {
        const decoded = incoProgram.coder.accounts.decode(
          "incoAccount",
          info.data,
        ) as { owner: PublicKey; mint: PublicKey };
        if (!decoded.owner.equals(owner) || !decoded.mint.equals(mint)) {
          throw new Error(
            `Inco account ${account.publicKey.toBase58()} exists with owner=${decoded.owner.toBase58()} mint=${decoded.mint.toBase58()} (expected owner=${owner.toBase58()} mint=${mint.toBase58()}). Delete scripts/keys/*vault*.json for this market or pass fresh keys.`,
          );
        }
      } catch (err) {
        throw new Error(
          `Failed to decode existing Inco account ${account.publicKey.toBase58()}: ${err}`,
        );
      }
      return;
    }
    await incoProgram.methods
      .initializeAccount()
      .accounts({
        account: account.publicKey,
        mint,
        owner,
        payer: payer.publicKey,
        systemProgram: SystemProgram.programId,
        incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
      })
      .signers([account, payer])
      .rpc();
  };

  await ensureIncoAccount(baseVault, baseMint, incoVaultAuthority);
  await ensureIncoAccount(quoteVault, quoteMint, incoVaultAuthority);

  const stateInfo = await provider.connection.getAccountInfo(statePda);
  if (!stateInfo) {
    const sig = await (program.methods
      .initialize(requireAttestation)
      .accounts({
        state: statePda,
        incoVaultAuthority,
        incoBaseVault: baseVault.publicKey,
        incoQuoteVault: quoteVault.publicKey,
        incoBaseMint: baseMint,
        incoQuoteMint: quoteMint,
        admin,
        payer: payer.publicKey,
        systemProgram: SystemProgram.programId,
        incoTokenProgram: INCO_TOKEN_PROGRAM_ID,
      } as any)
      .signers([payer, ...(adminSigner ? [adminSigner] : [])])
      .rpc()) as string;
    console.log("initialize.tx:", sig);
  } else {
    console.log("initialize: state already exists, skipping init");
  }

  console.log("state:", statePda.toBase58());
  console.log("vaultAuthority:", incoVaultAuthority.toBase58());
  console.log("baseVault:", baseVault.publicKey.toBase58());
  console.log("quoteVault:", quoteVault.publicKey.toBase58());
  console.log("admin:", admin.toBase58());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
