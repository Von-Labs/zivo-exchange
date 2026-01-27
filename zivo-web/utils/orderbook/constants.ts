import { PublicKey } from "@solana/web3.js";
import orderbookIdl from "@/idl/zivo_orderbook_program.json";
import {
  INCO_LIGHTNING_PROGRAM_ID,
  INCO_TOKEN_PROGRAM_ID,
} from "@/utils/constants";

export const ORDERBOOK_PROGRAM_ID = new PublicKey(orderbookIdl.address);

export const BASE_MINT_PUBLIC_KEY =
  "B3DpWDqhBKp7vYGhEnDyiqkAtYqmsB8ouWVJoFuP1Y5H";
export const QUOTE_MINT_PUBLIC_KEY =
  "6xdSaURq4wsespTZ2uxqbiqf6epqRp2cnSywkrMN5SAo";

export const ORDERBOOK_STATE_SEED = "orderbook_market_v1";
export const INCO_VAULT_AUTHORITY_SEED = "inco_vault_authority_v12";
export const DEPOSIT_SEED = "deposit_v9";
export const MATCH_RECORD_SEED = "match_record";

export { INCO_LIGHTNING_PROGRAM_ID, INCO_TOKEN_PROGRAM_ID };
