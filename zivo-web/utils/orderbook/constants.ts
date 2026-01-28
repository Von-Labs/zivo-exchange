import { PublicKey } from "@solana/web3.js";
import orderbookIdl from "@/idl/zivo_orderbook_program.json";
import {
  INCO_LIGHTNING_PROGRAM_ID,
  INCO_TOKEN_PROGRAM_ID,
} from "@/utils/constants";
import { INCO_USDC_MINT, INCO_WSOL_MINT } from "@/utils/mints";

export const ORDERBOOK_PROGRAM_ID = new PublicKey(orderbookIdl.address);

export const BASE_MINT_PUBLIC_KEY = INCO_WSOL_MINT; // Devnet Inco wSOL (base)
export const QUOTE_MINT_PUBLIC_KEY = INCO_USDC_MINT; // Devnet Inco USDC (quote)

export const ORDERBOOK_STATE_SEED = "orderbook_market_v1";
export const INCO_VAULT_AUTHORITY_SEED = "inco_vault_authority_v12";
export const DEPOSIT_SEED = "deposit_v9";
export const MATCH_RECORD_SEED = "match_record";

export { INCO_LIGHTNING_PROGRAM_ID, INCO_TOKEN_PROGRAM_ID };
