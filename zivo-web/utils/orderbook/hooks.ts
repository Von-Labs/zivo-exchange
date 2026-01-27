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

export type OrderbookSlotView = {
  owner: string;
  priceHandle: string;
  qtyHandle: string;
  clientOrderId: string;
  escrowBaseAmount: string;
  escrowQuoteAmount: string;
  isActive: boolean;
};

export type OrderbookStateView = {
  orderSeq: string;
  bidCount: string;
  askCount: string;
  bestBid: OrderbookSlotView;
  bestAsk: OrderbookSlotView;
  lastMatchHandle: string;
  incoBaseMint: string;
  incoQuoteMint: string;
  incoVaultAuthority: string;
  incoBaseVault: string;
  incoQuoteVault: string;
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

const formatSlot = (slot: unknown): OrderbookSlotView => {
  if (!slot || typeof slot !== "object") {
    return {
      owner: "",
      priceHandle: "0",
      qtyHandle: "0",
      clientOrderId: "0",
      escrowBaseAmount: "0",
      escrowQuoteAmount: "0",
      isActive: false,
    };
  }

  const owner = getField(
    (slot as { owner?: unknown }).owner,
    (slot as { owner?: unknown }).owner,
  );

  return {
    owner:
      owner && typeof owner === "object" && "toBase58" in owner
        ? (owner as { toBase58: () => string }).toBase58()
        : owner != null
          ? String(owner)
          : "",
    priceHandle: formatSlotValue(
      getField(
        (slot as { priceHandle?: unknown }).priceHandle,
        (slot as { price_handle?: unknown }).price_handle,
      ),
    ),
    qtyHandle: formatSlotValue(
      getField(
        (slot as { qtyHandle?: unknown }).qtyHandle,
        (slot as { qty_handle?: unknown }).qty_handle,
      ),
    ),
    clientOrderId: formatSlotValue(
      getField(
        (slot as { clientOrderId?: unknown }).clientOrderId,
        (slot as { client_order_id?: unknown }).client_order_id,
      ),
    ),
    escrowBaseAmount: formatSlotValue(
      getField(
        (slot as { escrowBaseAmount?: unknown }).escrowBaseAmount,
        (slot as { escrow_base_amount?: unknown }).escrow_base_amount,
      ),
    ),
    escrowQuoteAmount: formatSlotValue(
      getField(
        (slot as { escrowQuoteAmount?: unknown }).escrowQuoteAmount,
        (slot as { escrow_quote_amount?: unknown }).escrow_quote_amount,
      ),
    ),
    isActive:
      Number(
        getField(
          (slot as { isActive?: unknown }).isActive,
          (slot as { is_active?: unknown }).is_active,
        ) ?? 0,
      ) === 1,
  };
};

const formatPubkey = (value: unknown): string => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && "toBase58" in value) {
    return (value as { toBase58: () => string }).toBase58();
  }
  return String(value);
};

const fetchOrderbookState = async (
  program: NonNullable<ReturnType<typeof useOrderbookProgram>>,
): Promise<OrderbookStateView> => {
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

  return {
    orderSeq: formatSlotValue(
      getField(
        (state as { orderSeq?: unknown }).orderSeq,
        (state as { order_seq?: unknown }).order_seq,
      ),
    ),
    bidCount: formatSlotValue(
      getField(
        (state as { bidCount?: unknown }).bidCount,
        (state as { bid_count?: unknown }).bid_count,
      ),
    ),
    askCount: formatSlotValue(
      getField(
        (state as { askCount?: unknown }).askCount,
        (state as { ask_count?: unknown }).ask_count,
      ),
    ),
    bestBid: formatSlot(bestBid),
    bestAsk: formatSlot(bestAsk),
    lastMatchHandle: formatSlotValue(
      getField(
        (state as { lastMatchHandle?: unknown }).lastMatchHandle,
        (state as { last_match_handle?: unknown }).last_match_handle,
      ),
    ),
    incoBaseMint: formatPubkey(
      getField(
        (state as { incoBaseMint?: unknown }).incoBaseMint,
        (state as { inco_base_mint?: unknown }).inco_base_mint,
      ),
    ),
    incoQuoteMint: formatPubkey(
      getField(
        (state as { incoQuoteMint?: unknown }).incoQuoteMint,
        (state as { inco_quote_mint?: unknown }).inco_quote_mint,
      ),
    ),
    incoVaultAuthority: formatPubkey(
      getField(
        (state as { incoVaultAuthority?: unknown }).incoVaultAuthority,
        (state as { inco_vault_authority?: unknown }).inco_vault_authority,
      ),
    ),
    incoBaseVault: formatPubkey(
      getField(
        (state as { incoBaseVault?: unknown }).incoBaseVault,
        (state as { inco_base_vault?: unknown }).inco_base_vault,
      ),
    ),
    incoQuoteVault: formatPubkey(
      getField(
        (state as { incoQuoteVault?: unknown }).incoQuoteVault,
        (state as { inco_quote_vault?: unknown }).inco_quote_vault,
      ),
    ),
  };
};

export const useOrderbookState = () => {
  const program = useOrderbookProgram();

  return useQuery({
    queryKey: ["orderbookState", program?.programId?.toBase58()],
    queryFn: () => fetchOrderbookState(program as NonNullable<typeof program>),
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
