import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { Connection, Signer } from "@solana/web3.js";
import { AnchorWallet } from "@solana/wallet-adapter-react";
import orderbookIdl from "@/idl/zivo_orderbook_program.json";
import { ORDERBOOK_PROGRAM_ID } from "./constants";
import * as methods from "./methods";

export const getOrderbookProgram = (
  connection: Connection,
  wallet: AnchorWallet
): Program<Idl> => {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  return new Program(orderbookIdl as Idl, ORDERBOOK_PROGRAM_ID, provider);
};

export const createOrderbookClient = (program: Program<Idl>) => ({
  program,
  buildInitialize: (accounts: methods.InitializeAccounts) =>
    methods.buildInitialize(program, accounts),
  initialize: (accounts: methods.InitializeAccounts, signers?: Signer[]) =>
    methods.initialize(program, accounts, signers ?? []),
  buildInitializeDeposit: (accounts: methods.InitializeDepositAccounts) =>
    methods.buildInitializeDeposit(program, accounts),
  initializeDeposit: (
    accounts: methods.InitializeDepositAccounts,
    signers?: Signer[]
  ) => methods.initializeDeposit(program, accounts, signers ?? []),
  buildPlaceOrder: (
    args: methods.PlaceOrderArgs,
    accounts: methods.PlaceOrderAccounts
  ) => methods.buildPlaceOrder(program, args, accounts),
  placeOrder: (
    args: methods.PlaceOrderArgs,
    accounts: methods.PlaceOrderAccounts,
    signers?: Signer[]
  ) => methods.placeOrder(program, args, accounts, signers ?? []),
  buildCancelOrder: (
    args: methods.CancelOrderArgs,
    accounts: methods.CancelOrderAccounts
  ) => methods.buildCancelOrder(program, args, accounts),
  cancelOrder: (
    args: methods.CancelOrderArgs,
    accounts: methods.CancelOrderAccounts,
    signers?: Signer[]
  ) => methods.cancelOrder(program, args, accounts, signers ?? []),
  buildSubmitMatch: (
    args: methods.SubmitMatchArgs,
    accounts: methods.SubmitMatchAccounts
  ) => methods.buildSubmitMatch(program, args, accounts),
  submitMatch: (
    args: methods.SubmitMatchArgs,
    accounts: methods.SubmitMatchAccounts,
    signers?: Signer[]
  ) => methods.submitMatch(program, args, accounts, signers ?? []),
  buildSettleMatch: (
    args: methods.SettleMatchArgs,
    accounts: methods.SettleMatchAccounts
  ) => methods.buildSettleMatch(program, args, accounts),
  settleMatch: (
    args: methods.SettleMatchArgs,
    accounts: methods.SettleMatchAccounts,
    signers?: Signer[]
  ) => methods.settleMatch(program, args, accounts, signers ?? []),
  buildResetState: (accounts: methods.ResetStateAccounts) =>
    methods.buildResetState(program, accounts),
  resetState: (
    accounts: methods.ResetStateAccounts,
    signers?: Signer[]
  ) => methods.resetState(program, accounts, signers ?? []),
});

export type OrderbookClient = ReturnType<typeof createOrderbookClient>;
