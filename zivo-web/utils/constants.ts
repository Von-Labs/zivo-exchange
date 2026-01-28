import { PublicKey, Connection } from "@solana/web3.js";
import { Program, AnchorProvider, Idl } from "@coral-xyz/anchor";
import { AnchorWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import idl from "./idl.json";

export const PROGRAM_ID = new PublicKey(idl.address);
export const INCO_LIGHTNING_ID = new PublicKey(
  "5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj",
);
export const INCO_LIGHTNING_PROGRAM_ID = INCO_LIGHTNING_ID;
export const INCO_TOKEN_PROGRAM_ID = new PublicKey(
  "4cyJHzecVWuU2xux6bCAPAhALKQT8woBh4Vx3AGEGe5N",
);
export const INCO_MINT_DISCRIMINATOR = [254, 129, 245, 169, 202, 143, 198, 4];
export const INCO_ACCOUNT_DISCRIMINATOR = [18, 233, 131, 18, 230, 173, 249, 89];

// Derive allowance PDA for a handle and wallet
export const getAllowancePda = (
  handle: bigint,
  allowedAddress: PublicKey,
): [PublicKey, number] => {
  const handleBuffer = Buffer.alloc(16);
  let h = handle;
  for (let i = 0; i < 16; i++) {
    handleBuffer[i] = Number(h & BigInt(0xff));
    h = h >> BigInt(8);
  }
  return PublicKey.findProgramAddressSync(
    [handleBuffer, allowedAddress.toBuffer()],
    INCO_LIGHTNING_PROGRAM_ID,
  );
};

// Extract handle from account data bytes (little-endian u128 at offset 72-88)
export const extractHandle = (data: Buffer): bigint => {
  const bytes = data.slice(72, 88);
  let result = BigInt(0);
  for (let i = 15; i >= 0; i--) {
    result = result * BigInt(256) + BigInt(bytes[i]);
  }
  return result;
};

export const fetchUserMint = async (
  connection: Connection,
  wallet: PublicKey,
): Promise<{ pubkey: PublicKey; data: Buffer } | null> => {
  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [
      {
        memcmp: {
          offset: 0,
          bytes: bs58.encode(Buffer.from(INCO_MINT_DISCRIMINATOR)),
        },
      },
      { memcmp: { offset: 9, bytes: wallet.toBase58() } },
    ],
  });
  return accounts.length
    ? { pubkey: accounts[0].pubkey, data: accounts[0].account.data as Buffer }
    : null;
};

export const fetchUserTokenAccount = async (
  connection: Connection,
  wallet: PublicKey,
  mint: PublicKey,
): Promise<{ pubkey: PublicKey; data: Buffer } | null> => {
  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [
      {
        memcmp: {
          offset: 0,
          bytes: bs58.encode(Buffer.from(INCO_ACCOUNT_DISCRIMINATOR)),
        },
      },
      { memcmp: { offset: 8, bytes: mint.toBase58() } },
      { memcmp: { offset: 40, bytes: wallet.toBase58() } },
    ],
  });
  return accounts.length
    ? { pubkey: accounts[0].pubkey, data: accounts[0].account.data as Buffer }
    : null;
};

export const getProgram = (connection: Connection, wallet: AnchorWallet) => {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  return new Program(idl as Idl, provider);
};

export const getZivoWrapProgram = (
  connection: Connection,
  wallet: AnchorWallet,
) => {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  const zivoWrapIdl = require("./zivo-wrap-idl.json");
  return new Program(zivoWrapIdl as Idl, provider);
};

export const getIncoTokenProgram = (
  connection: Connection,
  wallet: AnchorWallet,
) => {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  return new Program(idl as Idl, provider);
};

export const ZIVO_WRAP_PROGRAM_ID = new PublicKey(
  "8fzEszHEo8DwWRFQUpiMaAnAYK2rAec6oT4pRcZ12gMp",
);

// Whitelist SPL tokens - managed in code
export const WHITELISTED_SPL_TOKENS = [
  "So11111111111111111111111111111111111111112", // Devnet Wrapped SOL (wSOL)
  "ALS5QfhVoWZ4uQgMfZmrxLEgmWkcdqcu8RvJqZd74hBf", // Devnet USDC
  // Add more tokens as needed
];

// Get whitelist tokens (always returns the hardcoded list)
export const getWhitelistedTokens = (): string[] => {
  return WHITELISTED_SPL_TOKENS;
};

export const isTokenWhitelisted = (tokenMint: string): boolean => {
  return WHITELISTED_SPL_TOKENS.includes(tokenMint);
};
