import { BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";

import {
  BASE_MINT_PUBLIC_KEY,
  DEPOSIT_SEED,
  INCO_LIGHTNING_PROGRAM_ID,
  INCO_TOKEN_PROGRAM_ID,
  INCO_VAULT_AUTHORITY_SEED,
  ORDERBOOK_PROGRAM_ID,
  ORDERBOOK_STATE_SEED,
  QUOTE_MINT_PUBLIC_KEY,
} from "./constants";
import type { OrderbookProgram } from "./program";

const ORDER_SEED = "order_v1";

type U64Like = bigint | number | BN;

const toBigInt = (value: U64Like): bigint => {
  if (typeof value === "bigint") return value;
  if (BN.isBN(value)) return BigInt(value.toString());
  return BigInt(value);
};

const u64ToLeBuffer = (value: U64Like): Buffer => {
  const buf = Buffer.alloc(8);
  let v = toBigInt(value);
  for (let i = 0; i < 8; i += 1) {
    buf[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return buf;
};

export type OrderbookStateAccount = {
  admin: PublicKey;
  orderSeq: BN;
  requireAttestation: number;
  incoBaseMint: PublicKey;
  incoQuoteMint: PublicKey;
  incoVaultAuthority: PublicKey;
  incoBaseVault: PublicKey;
  incoQuoteVault: PublicKey;
};

export type OrderAccount = {
  owner: PublicKey;
  side: number;
  isOpen: number;
  price: BN;
  seq: BN;
  remainingHandle: BN;
  bump: number;
};

export type DepositAccount = {
  user: PublicKey;
  baseIncoAccount: PublicKey;
  quoteIncoAccount: PublicKey;
  bump: number;
};

export const getDefaultBaseMint = (): PublicKey =>
  new PublicKey(BASE_MINT_PUBLIC_KEY);

export const getDefaultQuoteMint = (): PublicKey =>
  new PublicKey(QUOTE_MINT_PUBLIC_KEY);

export const deriveOrderbookStatePda = (
  baseMint: PublicKey,
  quoteMint: PublicKey,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from(ORDERBOOK_STATE_SEED),
      baseMint.toBuffer(),
      quoteMint.toBuffer(),
    ],
    ORDERBOOK_PROGRAM_ID,
  );

export const deriveIncoVaultAuthorityPda = (
  state: PublicKey,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [Buffer.from(INCO_VAULT_AUTHORITY_SEED), state.toBuffer()],
    ORDERBOOK_PROGRAM_ID,
  );

export const deriveDepositPda = (
  state: PublicKey,
  user: PublicKey,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [Buffer.from(DEPOSIT_SEED), state.toBuffer(), user.toBuffer()],
    ORDERBOOK_PROGRAM_ID,
  );

export const deriveOrderPda = (
  state: PublicKey,
  owner: PublicKey,
  orderSeq: U64Like,
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [Buffer.from(ORDER_SEED), state.toBuffer(), owner.toBuffer(), u64ToLeBuffer(orderSeq)],
    ORDERBOOK_PROGRAM_ID,
  );

export const fetchOrderbookState = async (
  program: OrderbookProgram,
  state: PublicKey,
): Promise<OrderbookStateAccount> =>
  (await program.account.orderbookState.fetch(state)) as OrderbookStateAccount;

export const fetchOrderbookStateByMints = async (
  program: OrderbookProgram,
  baseMint: PublicKey,
  quoteMint: PublicKey,
): Promise<{ state: PublicKey; account: OrderbookStateAccount }> => {
  const [state] = deriveOrderbookStatePda(baseMint, quoteMint);
  const account = await fetchOrderbookState(program, state);
  return { state, account };
};

export const fetchOrder = async (
  program: OrderbookProgram,
  order: PublicKey,
): Promise<OrderAccount> =>
  (await program.account.order.fetch(order)) as OrderAccount;

export const fetchDepositAccount = async (
  program: OrderbookProgram,
  deposit: PublicKey,
): Promise<DepositAccount> =>
  (await program.account.depositAccount.fetch(deposit)) as DepositAccount;

export type InitializeOrderbookParams = {
  program: OrderbookProgram;
  state: PublicKey;
  incoVaultAuthority: PublicKey;
  incoBaseVault: PublicKey;
  incoQuoteVault: PublicKey;
  incoBaseMint: PublicKey;
  incoQuoteMint: PublicKey;
  admin: PublicKey;
  payer: PublicKey;
  requireAttestation: boolean;
};

export const initializeOrderbook = async ({
  program,
  state,
  incoVaultAuthority,
  incoBaseVault,
  incoQuoteVault,
  incoBaseMint,
  incoQuoteMint,
  admin,
  payer,
  requireAttestation,
}: InitializeOrderbookParams): Promise<string> =>
  program.methods
    .initialize(requireAttestation)
    .accounts({
      state,
      incoVaultAuthority,
      incoBaseVault,
      incoQuoteVault,
      incoBaseMint,
      incoQuoteMint,
      admin,
      payer,
      systemProgram: SystemProgram.programId,
      incoTokenProgram: INCO_TOKEN_PROGRAM_ID,
    })
    .rpc();

export type InitializeDepositParams = {
  program: OrderbookProgram;
  payer: PublicKey;
  user: PublicKey;
  state: PublicKey;
  deposit: PublicKey;
  userBaseInco: PublicKey;
  userQuoteInco: PublicKey;
};

export const initializeDeposit = async ({
  program,
  payer,
  user,
  state,
  deposit,
  userBaseInco,
  userQuoteInco,
}: InitializeDepositParams): Promise<string> =>
  program.methods
    .initializeDeposit()
    .accounts({
      payer,
      user,
      state,
      deposit,
      userBaseInco,
      userQuoteInco,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

export type PlaceOrderParams = {
  program: OrderbookProgram;
  state: PublicKey;
  order: PublicKey;
  trader: PublicKey;
  incoVaultAuthority: PublicKey;
  incoBaseVault: PublicKey;
  incoQuoteVault: PublicKey;
  traderBaseInco: PublicKey;
  traderQuoteInco: PublicKey;
  incoBaseMint: PublicKey;
  incoQuoteMint: PublicKey;
  side: number;
  price: U64Like;
  sizeCiphertext: Buffer | Uint8Array | number[];
  inputType: number;
  escrowCiphertext: Buffer | Uint8Array | number[];
  escrowInputType: number;
};

export const placeOrder = async ({
  program,
  state,
  order,
  trader,
  incoVaultAuthority,
  incoBaseVault,
  incoQuoteVault,
  traderBaseInco,
  traderQuoteInco,
  incoBaseMint,
  incoQuoteMint,
  side,
  price,
  sizeCiphertext,
  inputType,
  escrowCiphertext,
  escrowInputType,
}: PlaceOrderParams): Promise<string> =>
  program.methods
    .placeOrder(side, new BN(toBigInt(price).toString()), sizeCiphertext, inputType, escrowCiphertext, escrowInputType)
    .accounts({
      state,
      order,
      trader,
      incoVaultAuthority,
      incoBaseVault,
      incoQuoteVault,
      traderBaseInco,
      traderQuoteInco,
      incoBaseMint,
      incoQuoteMint,
      systemProgram: SystemProgram.programId,
      incoTokenProgram: INCO_TOKEN_PROGRAM_ID,
      incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
    })
    .rpc();

export type CancelOrderParams = {
  program: OrderbookProgram;
  state: PublicKey;
  order: PublicKey;
  trader: PublicKey;
  incoVaultAuthority: PublicKey;
  incoBaseVault: PublicKey;
  incoQuoteVault: PublicKey;
  traderBaseInco: PublicKey;
  traderQuoteInco: PublicKey;
  remainingCiphertext: Buffer | Uint8Array | number[];
  inputType: number;
};

export const cancelOrder = async ({
  program,
  state,
  order,
  trader,
  incoVaultAuthority,
  incoBaseVault,
  incoQuoteVault,
  traderBaseInco,
  traderQuoteInco,
  remainingCiphertext,
  inputType,
}: CancelOrderParams): Promise<string> =>
  program.methods
    .cancelOrder(remainingCiphertext, inputType)
    .accounts({
      state,
      order,
      trader,
      incoVaultAuthority,
      incoBaseVault,
      incoQuoteVault,
      traderBaseInco,
      traderQuoteInco,
      systemProgram: SystemProgram.programId,
      incoTokenProgram: INCO_TOKEN_PROGRAM_ID,
      incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
    })
    .rpc();

export type CloseOrderParams = {
  program: OrderbookProgram;
  state: PublicKey;
  order: PublicKey;
  owner: PublicKey;
};

export const closeOrder = async ({
  program,
  state,
  order,
  owner,
}: CloseOrderParams): Promise<string> =>
  program.methods
    .closeOrder()
    .accounts({
      state,
      order,
      owner,
      incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
    })
    .rpc();

export type MatchOrderParams = {
  program: OrderbookProgram;
  state: PublicKey;
  makerOrder: PublicKey;
  owner: PublicKey;
  matcher: PublicKey;
  taker: PublicKey;
  incoVaultAuthority: PublicKey;
  incoBaseVault: PublicKey;
  incoQuoteVault: PublicKey;
  makerBaseInco: PublicKey;
  makerQuoteInco: PublicKey;
  takerBaseInco: PublicKey;
  takerQuoteInco: PublicKey;
  incoBaseMint: PublicKey;
  incoQuoteMint: PublicKey;
  takerSide: number;
  takerPrice: U64Like;
  takerReqBaseCiphertext: Buffer | Uint8Array | number[];
  fillBaseCiphertext: Buffer | Uint8Array | number[];
  fillQuoteCiphertext: Buffer | Uint8Array | number[];
  inputType: number;
};

export const matchOrder = async ({
  program,
  state,
  makerOrder,
  owner,
  matcher,
  taker,
  incoVaultAuthority,
  incoBaseVault,
  incoQuoteVault,
  makerBaseInco,
  makerQuoteInco,
  takerBaseInco,
  takerQuoteInco,
  incoBaseMint,
  incoQuoteMint,
  takerSide,
  takerPrice,
  takerReqBaseCiphertext,
  fillBaseCiphertext,
  fillQuoteCiphertext,
  inputType,
}: MatchOrderParams): Promise<string> =>
  program.methods
    .matchOrder(
      takerSide,
      new BN(toBigInt(takerPrice).toString()),
      takerReqBaseCiphertext,
      fillBaseCiphertext,
      fillQuoteCiphertext,
      inputType,
    )
    .accounts({
      state,
      makerOrder,
      owner,
      matcher,
      taker,
      incoVaultAuthority,
      incoBaseVault,
      incoQuoteVault,
      makerBaseInco,
      makerQuoteInco,
      takerBaseInco,
      takerQuoteInco,
      incoBaseMint,
      incoQuoteMint,
      systemProgram: SystemProgram.programId,
      incoTokenProgram: INCO_TOKEN_PROGRAM_ID,
      incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
    })
    .rpc();

export type BumpOrderSeqParams = {
  program: OrderbookProgram;
  state: PublicKey;
  admin: PublicKey;
};

export const bumpOrderSeq = async ({
  program,
  state,
  admin,
}: BumpOrderSeqParams): Promise<string> =>
  program.methods
    .bumpOrderSeq()
    .accounts({
      state,
      admin,
    })
    .rpc();

export type ResetStateParams = {
  program: OrderbookProgram;
  state: PublicKey;
  admin: PublicKey;
};

export const resetState = async ({
  program,
  state,
  admin,
}: ResetStateParams): Promise<string> =>
  program.methods
    .resetState()
    .accounts({
      state,
      admin,
    })
    .rpc();
