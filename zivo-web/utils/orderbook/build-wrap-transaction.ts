import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import bs58 from "bs58";
import { encryptValue } from "@inco/solana-sdk/encryption";
import { BN } from "@coral-xyz/anchor";
import type { AnchorWallet } from "@solana/wallet-adapter-react";

import {
  getAllowancePda,
  extractHandle,
  getIncoTokenProgram,
  getZivoWrapProgram,
  INCO_LIGHTNING_ID,
  INCO_TOKEN_PROGRAM_ID,
  ZIVO_WRAP_PROGRAM_ID,
} from "@/utils/constants";
import { SPL_WRAPPED_SOL_MINT } from "@/utils/mints";
import { findExistingIncoAccount } from "./hooks/inco-accounts";

const VAULT_DISCRIMINATOR = [211, 8, 232, 43, 2, 152, 117, 119];
const WRAPPED_SOL_MINT = new PublicKey(SPL_WRAPPED_SOL_MINT);

export type WrapVaultData = {
  vault: PublicKey;
  authority: PublicKey;
  splTokenMint: PublicKey;
  incoTokenMint: PublicKey;
  vaultTokenAccount: PublicKey;
  isInitialized: boolean;
};

const parseVaultAccount = (
  vault: PublicKey,
  data: Buffer,
): WrapVaultData => {
  let offset = 8;
  const authority = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const splTokenMint = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const incoTokenMint = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const vaultTokenAccount = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const isInitialized = data[offset] === 1;

  return {
    vault,
    authority,
    splTokenMint,
    incoTokenMint,
    vaultTokenAccount,
    isInitialized,
  };
};

const fetchHandleForIncoAccount = async ({
  connection,
  wallet,
  account,
}: {
  connection: Connection;
  wallet: AnchorWallet;
  account: PublicKey;
}): Promise<bigint> => {
  try {
    const incoTokenProgram = getIncoTokenProgram(connection, wallet);
    const data = await (incoTokenProgram.account as any).incoAccount.fetch(
      account,
    );
    const handleValue =
      data?.amount?.handle ?? data?.amount ?? data?.handle ?? null;
    if (handleValue?.toString) {
      return BigInt(handleValue.toString());
    }
  } catch {
    // Fallback to raw data decode below.
  }

  const accountInfo = await connection.getAccountInfo(account);
  if (!accountInfo) {
    throw new Error("Inco account data not found");
  }
  return extractHandle(accountInfo.data);
};

export const fetchWrapVaultByIncoMint = async (
  connection: Connection,
  incoMint: PublicKey,
): Promise<WrapVaultData | null> => {
  const vaultAccounts = await connection.getProgramAccounts(
    ZIVO_WRAP_PROGRAM_ID,
    {
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: bs58.encode(Buffer.from(VAULT_DISCRIMINATOR)),
          },
        },
        {
          memcmp: {
            offset: 72,
            bytes: incoMint.toBase58(),
          },
        },
      ],
    },
  );

  if (vaultAccounts.length === 0) {
    return null;
  }

  return parseVaultAccount(
    vaultAccounts[0].pubkey,
    vaultAccounts[0].account.data as Buffer,
  );
};

export type BuildWrapTransactionParams = {
  connection: Connection;
  wallet: AnchorWallet;
  owner: PublicKey;
  incoMint: PublicKey;
  amountLamports: bigint;
  feePayer: PublicKey;
};

export const buildWrapTransaction = async ({
  connection,
  wallet,
  owner,
  incoMint,
  amountLamports,
  feePayer,
}: BuildWrapTransactionParams): Promise<Transaction> => {
  if (amountLamports <= 0n) {
    throw new Error("Wrap amount must be greater than zero");
  }

  const vaultData = await fetchWrapVaultByIncoMint(connection, incoMint);
  if (!vaultData) {
    throw new Error("No wrap vault found for the selected Inco mint");
  }

  if (!vaultData.isInitialized) {
    throw new Error("Wrap vault is not initialized");
  }

  const userSplAccount = await getAssociatedTokenAddress(
    vaultData.splTokenMint,
    owner,
  );
  const isWrappedSol = vaultData.splTokenMint.equals(WRAPPED_SOL_MINT);
  const preInstructions: TransactionInstruction[] = [];

  if (isWrappedSol) {
    const userSplAccountInfo = await connection.getAccountInfo(userSplAccount);
    if (!userSplAccountInfo) {
      preInstructions.push(
        createAssociatedTokenAccountInstruction(
          feePayer,
          userSplAccount,
          owner,
          vaultData.splTokenMint,
        ),
      );
    }

    const lamports = Number(amountLamports);
    if (!Number.isSafeInteger(lamports)) {
      throw new Error("Wrap amount is too large");
    }

    preInstructions.push(
      SystemProgram.transfer({
        fromPubkey: owner,
        toPubkey: userSplAccount,
        lamports,
      }),
    );
    preInstructions.push(createSyncNativeInstruction(userSplAccount));
  } else {
    const userSplAccountInfo = await connection.getAccountInfo(userSplAccount);
    if (!userSplAccountInfo) {
      throw new Error(
        "You do not have a token account for the required SPL token",
      );
    }
  }

  const incoAccount = await findExistingIncoAccount(
    connection,
    owner,
    incoMint,
  );
  if (!incoAccount) {
    throw new Error("Please initialize Inco accounts before wrapping");
  }

  const handle = await fetchHandleForIncoAccount({
    connection,
    wallet,
    account: incoAccount,
  });
  const [allowancePda] = getAllowancePda(handle, owner);

  const encryptedHex = await encryptValue(amountLamports);
  const ciphertext = Buffer.from(encryptedHex, "hex");

  const program = getZivoWrapProgram(connection, wallet);
  const tx = await program.methods
    .wrapToken(ciphertext, 0, new BN(amountLamports.toString()))
    .preInstructions(preInstructions)
    .accounts({
      vault: vaultData.vault,
      splTokenMint: vaultData.splTokenMint,
      incoTokenMint: vaultData.incoTokenMint,
      userSplTokenAccount: userSplAccount,
      vaultTokenAccount: vaultData.vaultTokenAccount,
      userIncoTokenAccount: incoAccount,
      user: owner,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      incoLightningProgram: INCO_LIGHTNING_ID,
      incoTokenProgram: INCO_TOKEN_PROGRAM_ID,
    })
    .remainingAccounts([
      { pubkey: allowancePda, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
    ])
    .transaction();

  return tx;
};

export type BuildUnwrapTransactionParams = {
  connection: Connection;
  wallet: AnchorWallet;
  owner: PublicKey;
  incoMint: PublicKey;
  amountLamports: bigint;
  feePayer: PublicKey;
};

export const buildUnwrapTransaction = async ({
  connection,
  wallet,
  owner,
  incoMint,
  amountLamports,
  feePayer,
}: BuildUnwrapTransactionParams): Promise<{
  tx: Transaction;
  createdAta: boolean;
  userSplAccount: PublicKey;
  splTokenMint: PublicKey;
}> => {
  if (amountLamports <= 0n) {
    throw new Error("Unwrap amount must be greater than zero");
  }

  const vaultData = await fetchWrapVaultByIncoMint(connection, incoMint);
  if (!vaultData) {
    throw new Error("No wrap vault found for the selected Inco mint");
  }

  if (!vaultData.isInitialized) {
    throw new Error("Wrap vault is not initialized");
  }

  const userIncoAccount = await findExistingIncoAccount(
    connection,
    owner,
    incoMint,
  );
  if (!userIncoAccount) {
    throw new Error("Inco account not found for unwrap");
  }

  const userSplAccount = await getAssociatedTokenAddress(
    vaultData.splTokenMint,
    owner,
  );
  const userSplInfo = await connection.getAccountInfo(userSplAccount);
  const createdAta = !userSplInfo;

  const encryptedHex = await encryptValue(amountLamports);
  const ciphertext = Buffer.from(encryptedHex, "hex");

  const program = getZivoWrapProgram(connection, wallet);

  const instructions: TransactionInstruction[] = [];
  if (!userSplInfo) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        feePayer,
        userSplAccount,
        owner,
        vaultData.splTokenMint,
      ),
    );
  }

  const unwrapIx = await program.methods
    .unwrapToken(ciphertext, 0, new BN(amountLamports.toString()))
    .accounts({
      vault: vaultData.vault,
      splTokenMint: vaultData.splTokenMint,
      incoTokenMint: vaultData.incoTokenMint,
      userSplTokenAccount: userSplAccount,
      vaultTokenAccount: vaultData.vaultTokenAccount,
      userIncoTokenAccount: userIncoAccount,
      user: owner,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      incoLightningProgram: INCO_LIGHTNING_ID,
      incoTokenProgram: INCO_TOKEN_PROGRAM_ID,
    })
    .instruction();

  const tx = new Transaction();
  tx.add(...instructions, unwrapIx);
  tx.feePayer = feePayer;

  return {
    tx,
    createdAta,
    userSplAccount,
    splTokenMint: vaultData.splTokenMint,
  };
};
