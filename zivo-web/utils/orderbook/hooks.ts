import { useMemo } from "react";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { Signer } from "@solana/web3.js";
import { createOrderbookClient, getOrderbookProgram } from "./client";
import { findOrderbookStatePda } from "./pdas";
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

export type OrderRow = {
  status: string;
  side: "Buy" | "Sell";
  asset: string;
  orderValue: string;
  time: string;
};

const getField = <T>(
  value: T | undefined,
  fallback: T | undefined,
): T | undefined => value ?? fallback;

const formatSlotValue = (value: unknown): string => {
  if (value == null) return "0";
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  if (typeof value === "bigint") return value.toString();
  if (typeof (value as { toString: () => string }).toString === "function") {
    return (value as { toString: () => string }).toString();
  }
  return "0";
};

const fetchOrderbookOrders = async (
  program: NonNullable<ReturnType<typeof useOrderbookProgram>>,
): Promise<OrderRow[]> => {
  const [statePda] = findOrderbookStatePda(program.programId);
  const state = await program.account.orderbookState.fetch(statePda);

  const bestBid = getField(
    (state as { bestBid?: unknown }).bestBid,
    (state as { best_bid?: unknown }).best_bid,
  );
  const bestAsk = getField(
    (state as { bestAsk?: unknown }).bestAsk,
    (state as { best_ask?: unknown }).best_ask,
  );

  const slots = [
    { slot: bestBid, side: "Buy" as const },
    { slot: bestAsk, side: "Sell" as const },
  ];

  const nowLabel = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return slots
    .map(({ slot, side }) => {
      if (!slot || typeof slot !== "object") return null;
      const isActive =
        Number(
          getField(
            (slot as { isActive?: unknown }).isActive,
            (slot as { is_active?: unknown }).is_active,
          ) ?? 0,
        ) === 1;
      if (!isActive) return null;

      const escrowBaseAmount = formatSlotValue(
        getField(
          (slot as { escrowBaseAmount?: unknown }).escrowBaseAmount,
          (slot as { escrow_base_amount?: unknown }).escrow_base_amount,
        ),
      );
      const escrowQuoteAmount = formatSlotValue(
        getField(
          (slot as { escrowQuoteAmount?: unknown }).escrowQuoteAmount,
          (slot as { escrow_quote_amount?: unknown }).escrow_quote_amount,
        ),
      );

      return {
        status: "Open",
        side,
        asset: "SOL/USDC",
        orderValue: `${escrowBaseAmount} / ${escrowQuoteAmount}`,
        time: nowLabel,
      };
    })
    .filter((row): row is OrderRow => Boolean(row));
};

export const useOrderbookOrders = () => {
  const program = useOrderbookProgram();

  return useQuery({
    queryKey: ["orderbookOrders", program?.programId?.toBase58()],
    queryFn: () => fetchOrderbookOrders(program as NonNullable<typeof program>),
    enabled: Boolean(program),
    staleTime: 1000 * 5,
    refetchOnWindowFocus: false,
    retry: 1,
  });
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
