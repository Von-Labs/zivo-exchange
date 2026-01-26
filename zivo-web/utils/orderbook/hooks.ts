import { useMemo } from "react";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { useMutation } from "@tanstack/react-query";
import type { Signer } from "@solana/web3.js";
import { createOrderbookClient, getOrderbookProgram } from "./client";
import type {
  CancelOrderAccounts,
  CancelOrderArgs,
  InitializeAccounts,
  InitializeDepositAccounts,
  PlaceOrderAccounts,
  PlaceOrderArgs,
  ResetStateAccounts,
  SettleMatchAccounts,
  SettleMatchArgs,
  SubmitMatchAccounts,
  SubmitMatchArgs,
} from "./methods";

export const useOrderbookProgram = () => {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  return useMemo(() => {
    if (!wallet) return null;
    return getOrderbookProgram(connection, wallet);
  }, [connection, wallet]);
};

export const useOrderbookClient = () => {
  const program = useOrderbookProgram();

  return useMemo(() => {
    if (!program) return null;
    return createOrderbookClient(program);
  }, [program]);
};

const requireClient = (client: ReturnType<typeof useOrderbookClient>) => {
  if (!client) {
    throw new Error("Orderbook client unavailable. Connect wallet first.");
  }
  return client;
};

export type InitializeMutationVars = {
  accounts: InitializeAccounts;
  signers?: Signer[];
};

export type InitializeDepositMutationVars = {
  accounts: InitializeDepositAccounts;
  signers?: Signer[];
};

export type PlaceOrderMutationVars = {
  args: PlaceOrderArgs;
  accounts: PlaceOrderAccounts;
  signers?: Signer[];
};

export type CancelOrderMutationVars = {
  args: CancelOrderArgs;
  accounts: CancelOrderAccounts;
  signers?: Signer[];
};

export type SubmitMatchMutationVars = {
  args: SubmitMatchArgs;
  accounts: SubmitMatchAccounts;
  signers?: Signer[];
};

export type SettleMatchMutationVars = {
  args: SettleMatchArgs;
  accounts: SettleMatchAccounts;
  signers?: Signer[];
};

export type ResetStateMutationVars = {
  accounts: ResetStateAccounts;
  signers?: Signer[];
};

export const useInitializeOrderbook = () => {
  const client = useOrderbookClient();
  return useMutation({
    mutationFn: ({ accounts, signers }: InitializeMutationVars) =>
      requireClient(client).initialize(accounts, signers),
  });
};

export const useInitializeDeposit = () => {
  const client = useOrderbookClient();
  return useMutation({
    mutationFn: ({ accounts, signers }: InitializeDepositMutationVars) =>
      requireClient(client).initializeDeposit(accounts, signers),
  });
};

export const usePlaceOrder = () => {
  const client = useOrderbookClient();
  return useMutation({
    mutationFn: ({ args, accounts, signers }: PlaceOrderMutationVars) =>
      requireClient(client).placeOrder(args, accounts, signers),
  });
};

export const useCancelOrder = () => {
  const client = useOrderbookClient();
  return useMutation({
    mutationFn: ({ args, accounts, signers }: CancelOrderMutationVars) =>
      requireClient(client).cancelOrder(args, accounts, signers),
  });
};

export const useSubmitMatch = () => {
  const client = useOrderbookClient();
  return useMutation({
    mutationFn: ({ args, accounts, signers }: SubmitMatchMutationVars) =>
      requireClient(client).submitMatch(args, accounts, signers),
  });
};

export const useSettleMatch = () => {
  const client = useOrderbookClient();
  return useMutation({
    mutationFn: ({ args, accounts, signers }: SettleMatchMutationVars) =>
      requireClient(client).settleMatch(args, accounts, signers),
  });
};

export const useResetState = () => {
  const client = useOrderbookClient();
  return useMutation({
    mutationFn: ({ accounts, signers }: ResetStateMutationVars) =>
      requireClient(client).resetState(accounts, signers),
  });
};
