import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import {
  DEPOSIT_SEED,
  INCO_VAULT_AUTHORITY_SEED,
  MATCH_RECORD_SEED,
  ORDERBOOK_PROGRAM_ID,
  ORDERBOOK_STATE_SEED,
} from "./constants";

export type U64Like = BN | number | bigint;

const toBn = (value: U64Like): BN =>
  BN.isBN(value) ? value : new BN(value.toString());

const toU64LeBuffer = (value: U64Like): Buffer =>
  toBn(value).toArrayLike(Buffer, "le", 8);

export const findOrderbookStatePda = (
  programId: PublicKey = ORDERBOOK_PROGRAM_ID
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [Buffer.from(ORDERBOOK_STATE_SEED)],
    programId
  );

export const findIncoVaultAuthorityPda = (
  programId: PublicKey = ORDERBOOK_PROGRAM_ID
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [Buffer.from(INCO_VAULT_AUTHORITY_SEED)],
    programId
  );

export const findDepositPda = (
  user: PublicKey,
  programId: PublicKey = ORDERBOOK_PROGRAM_ID
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [Buffer.from(DEPOSIT_SEED), user.toBuffer()],
    programId
  );

export const findMatchRecordPda = (
  state: PublicKey,
  matchId: U64Like,
  programId: PublicKey = ORDERBOOK_PROGRAM_ID
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [Buffer.from(MATCH_RECORD_SEED), state.toBuffer(), toU64LeBuffer(matchId)],
    programId
  );
