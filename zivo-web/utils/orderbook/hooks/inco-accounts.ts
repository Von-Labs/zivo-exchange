import type { PublicKey } from "@solana/web3.js";
import { Keypair, SystemProgram } from "@solana/web3.js";
import bs58 from "bs58";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";

import {
  getIncoTokenProgram,
  INCO_ACCOUNT_DISCRIMINATOR,
  INCO_LIGHTNING_ID,
  INCO_TOKEN_PROGRAM_ID,
} from "@/utils/constants";

const INCO_MINT_DECIMALS_OFFSET = 76;

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
