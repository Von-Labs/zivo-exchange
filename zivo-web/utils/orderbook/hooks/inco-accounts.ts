import type { PublicKey } from "@solana/web3.js";
import { Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";

import {
  getIncoTokenProgram,
  INCO_ACCOUNT_DISCRIMINATOR,
  INCO_LIGHTNING_ID,
  INCO_TOKEN_PROGRAM_ID,
} from "@/utils/constants";

const INCO_MINT_DECIMALS_OFFSET = 76;

/**
 * Fetches decimals from Inco mint account using Anchor program
 * This is the recommended way as it uses the IDL structure
 * Reference: lightning-rod-solana/tests/inco-token.ts:169
 * Usage: const mintAccount = await program.account.incoMint.fetch(mintKeypair.publicKey);
 */
export const fetchIncoMintDecimalsWithProgram = async (
  connection: ReturnType<typeof useConnection>["connection"],
  wallet: NonNullable<ReturnType<typeof useAnchorWallet>>,
  mint: PublicKey,
): Promise<number | null> => {
  try {
    const program = getIncoTokenProgram(connection, wallet);
    // Fetch IncoMint account using Anchor program (similar to test file)
    const mintAccount: any = await (program.account as any).incoMint.fetch(mint);
    return mintAccount.decimals as number;
  } catch (error) {
    console.error("Error fetching inco mint decimals with program:", error);
    return null;
  }
};

/**
 * Fetches decimals from Inco mint account by reading raw data
 * Fallback method when Anchor program is not available
 */
export const fetchIncoMintDecimals = async (
  connection: ReturnType<typeof useConnection>["connection"],
  mint: PublicKey,
): Promise<number | null> => {
  const info = await connection.getAccountInfo(mint);
  if (!info || info.data.length <= INCO_MINT_DECIMALS_OFFSET) return null;
  return info.data[INCO_MINT_DECIMALS_OFFSET];
};

export const findExistingIncoAccount = async (
  connection: ReturnType<typeof useConnection>["connection"],
  owner: PublicKey,
  mint: PublicKey,
): Promise<PublicKey | null> => {
  const accounts = await connection.getProgramAccounts(INCO_TOKEN_PROGRAM_ID, {
    filters: [
      {
        memcmp: {
          offset: 0,
          bytes: bs58.encode(Buffer.from(INCO_ACCOUNT_DISCRIMINATOR)),
        },
      },
      { memcmp: { offset: 8, bytes: mint.toBase58() } },
      { memcmp: { offset: 40, bytes: owner.toBase58() } },
    ],
  });

  return accounts.length > 0 ? accounts[0].pubkey : null;
};

export const ensureIncoAccount = async ({
  connection,
  wallet,
  owner,
  mint,
}: {
  connection: ReturnType<typeof useConnection>["connection"];
  wallet: NonNullable<ReturnType<typeof useAnchorWallet>>;
  owner: PublicKey;
  mint: PublicKey;
}): Promise<PublicKey> => {
  const existing = await findExistingIncoAccount(connection, owner, mint);
  if (existing) return existing;

  const incoAccountKeypair = Keypair.generate();
  const incoTokenProgram = getIncoTokenProgram(connection, wallet);

  await incoTokenProgram.methods
    .initializeAccount()
    .accounts({
      account: incoAccountKeypair.publicKey,
      mint,
      owner,
      payer: owner,
      systemProgram: SystemProgram.programId,
      incoLightningProgram: INCO_LIGHTNING_ID,
    } as any)
    .signers([incoAccountKeypair])
    .rpc();

  return incoAccountKeypair.publicKey;
};

export const ensureIncoAccountsBatch = async ({
  connection,
  wallet,
  owner,
  mints,
}: {
  connection: ReturnType<typeof useConnection>["connection"];
  wallet: NonNullable<ReturnType<typeof useAnchorWallet>>;
  owner: PublicKey;
  mints: PublicKey[];
}): Promise<{ accounts: PublicKey[]; signature?: string }> => {
  const existing = await Promise.all(
    mints.map((mint) => findExistingIncoAccount(connection, owner, mint)),
  );

  const incoTokenProgram = getIncoTokenProgram(connection, wallet);
  const missing = mints
    .map((mint, idx) => ({ mint, existing: existing[idx] }))
    .filter((entry) => !entry.existing);

  if (missing.length === 0) {
    return { accounts: existing.filter(Boolean) as PublicKey[] };
  }

  const signers: Keypair[] = [];
  const instructions = await Promise.all(
    missing.map(async ({ mint }) => {
      const incoAccountKeypair = Keypair.generate();
      signers.push(incoAccountKeypair);
      return incoTokenProgram.methods
        .initializeAccount()
        .accounts({
          account: incoAccountKeypair.publicKey,
          mint,
          owner,
          payer: owner,
          systemProgram: SystemProgram.programId,
          incoLightningProgram: INCO_LIGHTNING_ID,
        } as any)
        .instruction();
    }),
  );

  const tx = new Transaction();
  tx.add(...instructions);

  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = owner;

  if (signers.length > 0) {
    tx.partialSign(...signers);
  }
  const signed = await wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(sig, "confirmed");

  const created = signers.map((signer) => signer.publicKey);
  const result = mints.map((mint) => {
    const idx = missing.findIndex((entry) => entry.mint.equals(mint));
    return idx >= 0 ? created[idx] : (existing[mints.indexOf(mint)] as PublicKey);
  });

  return { accounts: result, signature: sig };
};
