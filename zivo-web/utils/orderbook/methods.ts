import { Idl, Program } from "@coral-xyz/anchor";
import { PublicKey, Signer, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import {
  INCO_LIGHTNING_PROGRAM_ID,
  INCO_TOKEN_PROGRAM_ID,
} from "./constants";
import type { U64Like } from "./pdas";

export type U128Like = BN | number | bigint;

const toBn = (value: U64Like | U128Like): BN =>
  BN.isBN(value) ? value : new BN(value.toString());

const toBuffer = (value: Buffer | Uint8Array): Buffer => Buffer.from(value);

const withSystemProgram = <T extends { systemProgram?: PublicKey }>(
  accounts: T
): T & { systemProgram: PublicKey } => ({
  ...accounts,
  systemProgram: accounts.systemProgram ?? SystemProgram.programId,
});

const withIncoPrograms = <
  T extends {
    incoTokenProgram?: PublicKey;
    incoLightningProgram?: PublicKey;
  }
>(accounts: T): T & {
  incoTokenProgram: PublicKey;
  incoLightningProgram: PublicKey;
} => ({
  ...accounts,
  incoTokenProgram: accounts.incoTokenProgram ?? INCO_TOKEN_PROGRAM_ID,
  incoLightningProgram: accounts.incoLightningProgram ?? INCO_LIGHTNING_PROGRAM_ID,
});

export type InitializeAccounts = {
  state: PublicKey;
  incoVaultAuthority: PublicKey;
  incoBaseVault: PublicKey;
  incoQuoteVault: PublicKey;
  incoBaseMint: PublicKey;
  incoQuoteMint: PublicKey;
  payer: PublicKey;
  systemProgram?: PublicKey;
  incoTokenProgram?: PublicKey;
};

export type InitializeDepositAccounts = {
  payer: PublicKey;
  user: PublicKey;
  state: PublicKey;
  deposit: PublicKey;
  userBaseInco: PublicKey;
  userQuoteInco: PublicKey;
  systemProgram?: PublicKey;
};

export type PlaceOrderAccounts = {
  state: PublicKey;
  trader: PublicKey;
  incoVaultAuthority: PublicKey;
  incoBaseVault: PublicKey;
  incoQuoteVault: PublicKey;
  traderBaseInco: PublicKey;
  traderQuoteInco: PublicKey;
  incoBaseMint: PublicKey;
  incoQuoteMint: PublicKey;
  systemProgram?: PublicKey;
  incoTokenProgram?: PublicKey;
  incoLightningProgram?: PublicKey;
};

export type CancelOrderAccounts = {
  state: PublicKey;
  trader: PublicKey;
  incoVaultAuthority: PublicKey;
  incoBaseVault: PublicKey;
  incoQuoteVault: PublicKey;
  traderBaseInco: PublicKey;
  traderQuoteInco: PublicKey;
  systemProgram?: PublicKey;
  incoTokenProgram?: PublicKey;
  incoLightningProgram?: PublicKey;
};

export type SubmitMatchAccounts = {
  state: PublicKey;
  matchRecord: PublicKey;
  payer: PublicKey;
  validator: PublicKey;
  systemProgram?: PublicKey;
};

export type SettleMatchAccounts = {
  state: PublicKey;
  matchRecord: PublicKey;
  incoVaultAuthority: PublicKey;
  incoBaseVault: PublicKey;
  incoQuoteVault: PublicKey;
  bidOwnerBaseInco: PublicKey;
  askOwnerQuoteInco: PublicKey;
  incoBaseMint: PublicKey;
  incoQuoteMint: PublicKey;
  systemProgram?: PublicKey;
  incoTokenProgram?: PublicKey;
  incoLightningProgram?: PublicKey;
};

export type ResetStateAccounts = {
  state: PublicKey;
  admin: PublicKey;
};

export type PlaceOrderArgs = {
  side: number;
  priceCiphertext: Buffer | Uint8Array;
  qtyCiphertext: Buffer | Uint8Array;
  inputType: number;
  escrowBaseCiphertext: Buffer | Uint8Array;
  escrowQuoteCiphertext: Buffer | Uint8Array;
  clientOrderId: U64Like;
};

export type CancelOrderArgs = {
  side: number;
  clientOrderId: U64Like;
  escrowCiphertext: Buffer | Uint8Array;
  inputType: number;
};

export type SubmitMatchArgs = {
  matchId: U64Like;
  bidOwner: PublicKey;
  askOwner: PublicKey;
  baseAmountHandle: U128Like;
  quoteAmountHandle: U128Like;
};

export type SettleMatchArgs = {
  matchId: U64Like;
  baseCiphertext: Buffer | Uint8Array;
  quoteCiphertext: Buffer | Uint8Array;
  inputType: number;
};

export const buildInitialize = (
  program: Program<Idl>,
  accounts: InitializeAccounts
) =>
  program.methods.initialize().accounts({
    ...withSystemProgram(accounts),
    incoTokenProgram: accounts.incoTokenProgram ?? INCO_TOKEN_PROGRAM_ID,
  });

export const initialize = async (
  program: Program<Idl>,
  accounts: InitializeAccounts,
  signers: Signer[] = []
) => buildInitialize(program, accounts).signers(signers).rpc();

export const buildInitializeDeposit = (
  program: Program<Idl>,
  accounts: InitializeDepositAccounts
) => program.methods.initializeDeposit().accounts(withSystemProgram(accounts));

export const initializeDeposit = async (
  program: Program<Idl>,
  accounts: InitializeDepositAccounts,
  signers: Signer[] = []
) => buildInitializeDeposit(program, accounts).signers(signers).rpc();

export const buildPlaceOrder = (
  program: Program<Idl>,
  args: PlaceOrderArgs,
  accounts: PlaceOrderAccounts
) =>
  program.methods
    .placeOrder(
      args.side,
      toBuffer(args.priceCiphertext),
      toBuffer(args.qtyCiphertext),
      args.inputType,
      toBuffer(args.escrowBaseCiphertext),
      toBuffer(args.escrowQuoteCiphertext),
      toBn(args.clientOrderId)
    )
    .accounts(withSystemProgram(withIncoPrograms(accounts)));

export const placeOrder = async (
  program: Program<Idl>,
  args: PlaceOrderArgs,
  accounts: PlaceOrderAccounts,
  signers: Signer[] = []
) => buildPlaceOrder(program, args, accounts).signers(signers).rpc();

export const buildCancelOrder = (
  program: Program<Idl>,
  args: CancelOrderArgs,
  accounts: CancelOrderAccounts
) =>
  program.methods
    .cancelOrder(
      args.side,
      toBn(args.clientOrderId),
      toBuffer(args.escrowCiphertext),
      args.inputType
    )
    .accounts(withSystemProgram(withIncoPrograms(accounts)));

export const cancelOrder = async (
  program: Program<Idl>,
  args: CancelOrderArgs,
  accounts: CancelOrderAccounts,
  signers: Signer[] = []
) => buildCancelOrder(program, args, accounts).signers(signers).rpc();

export const buildSubmitMatch = (
  program: Program<Idl>,
  args: SubmitMatchArgs,
  accounts: SubmitMatchAccounts
) =>
  program.methods
    .submitMatch({
      matchId: toBn(args.matchId),
      bidOwner: args.bidOwner,
      askOwner: args.askOwner,
      baseAmountHandle: toBn(args.baseAmountHandle),
      quoteAmountHandle: toBn(args.quoteAmountHandle),
    })
    .accounts(withSystemProgram(accounts));

export const submitMatch = async (
  program: Program<Idl>,
  args: SubmitMatchArgs,
  accounts: SubmitMatchAccounts,
  signers: Signer[] = []
) => buildSubmitMatch(program, args, accounts).signers(signers).rpc();

export const buildSettleMatch = (
  program: Program<Idl>,
  args: SettleMatchArgs,
  accounts: SettleMatchAccounts
) =>
  program.methods
    .settleMatch({
      matchId: toBn(args.matchId),
      baseCiphertext: toBuffer(args.baseCiphertext),
      quoteCiphertext: toBuffer(args.quoteCiphertext),
      inputType: args.inputType,
    })
    .accounts(withSystemProgram(withIncoPrograms(accounts)));

export const settleMatch = async (
  program: Program<Idl>,
  args: SettleMatchArgs,
  accounts: SettleMatchAccounts,
  signers: Signer[] = []
) => buildSettleMatch(program, args, accounts).signers(signers).rpc();

export const buildResetState = (
  program: Program<Idl>,
  accounts: ResetStateAccounts
) => program.methods.resetState().accounts(accounts);

export const resetState = async (
  program: Program<Idl>,
  accounts: ResetStateAccounts,
  signers: Signer[] = []
) => buildResetState(program, accounts).signers(signers).rpc();
