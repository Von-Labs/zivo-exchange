import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  deriveOrderbookStatePda,
  fetchOrderbookState,
  getDefaultBaseMint,
  getDefaultQuoteMint,
  type OrderbookStateAccount,
} from "../methods";
import { useOrderbookProgram } from "./use-orderbook-program";
import type { OrderbookSlotView, OrderbookStateView, UseOrderbookStateParams } from "./types";

const emptySlot = (): OrderbookSlotView => ({
  owner: "—",
  clientOrderId: "—",
  escrowBaseAmount: "0",
  escrowQuoteAmount: "0",
  isActive: false,
});

const toOrderbookStateView = (
  state: OrderbookStateAccount,
): OrderbookStateView => ({
  admin: state.admin.toBase58(),
  orderSeq: state.orderSeq.toString(),
  requireAttestation: state.requireAttestation === 1,
  incoBaseMint: state.incoBaseMint.toBase58(),
  incoQuoteMint: state.incoQuoteMint.toBase58(),
  incoVaultAuthority: state.incoVaultAuthority.toBase58(),
  incoBaseVault: state.incoBaseVault.toBase58(),
  incoQuoteVault: state.incoQuoteVault.toBase58(),
  bestBid: emptySlot(),
  bestAsk: emptySlot(),
  bidCount: 0,
  askCount: 0,
  lastMatchHandle: "—",
});

export const useOrderbookState = (params: UseOrderbookStateParams = {}) => {
  const program = useOrderbookProgram();
  const baseMint = useMemo(
    () => params.baseMint ?? getDefaultBaseMint(),
    [params.baseMint?.toBase58()],
  );
  const quoteMint = useMemo(
    () => params.quoteMint ?? getDefaultQuoteMint(),
    [params.quoteMint?.toBase58()],
  );
  const [statePda] = useMemo(
    () => deriveOrderbookStatePda(baseMint, quoteMint),
    [baseMint, quoteMint],
  );

  return useQuery({
    queryKey: ["orderbook", "state", statePda.toBase58()],
    queryFn: async () => {
      if (!program) {
        throw new Error("Orderbook program not available");
      }
      const state = await fetchOrderbookState(program, statePda);
      return toOrderbookStateView(state);
    },
    enabled: Boolean(program),
    staleTime: 1000 * 10,
    gcTime: 1000 * 60 * 5,
    refetchInterval: params.refetchInterval ?? 1000 * 20,
    refetchOnWindowFocus: false,
    retry: 1,
  });
};
