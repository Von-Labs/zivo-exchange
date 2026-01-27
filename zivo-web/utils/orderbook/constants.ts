import { PublicKey } from "@solana/web3.js";
import orderbookIdl from "@/idl/zivo_orderbook_program.json";
import {
  INCO_LIGHTNING_PROGRAM_ID,
  INCO_TOKEN_PROGRAM_ID,
} from "@/utils/constants";

export const ORDERBOOK_PROGRAM_ID = new PublicKey(orderbookIdl.address);

export const ORDERBOOK_STATE_SEED = "orderbook_state_v16";
export const INCO_VAULT_AUTHORITY_SEED = "inco_vault_authority_v11";
export const DEPOSIT_SEED = "deposit_v9";
export const MATCH_RECORD_SEED = "match_record";

export { INCO_LIGHTNING_PROGRAM_ID, INCO_TOKEN_PROGRAM_ID };
