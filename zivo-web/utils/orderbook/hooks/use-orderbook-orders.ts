import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PublicKey } from "@solana/web3.js";

import {
  deriveOrderbookStatePda,
  deriveOrderPda,
  getDefaultBaseMint,
  getDefaultQuoteMint,
  type OrderAccount,
} from "../methods";
import { useOrderbookProgram } from "./use-orderbook-program";
import type { OrderView, UseOrderbookOrdersParams } from "./types";

const toOrderView = (order: OrderAccount, address: PublicKey): OrderView => {
  let side: OrderView["side"] = "Unknown";
  if (order.side === 0) side = "Bid";
  if (order.side === 1) side = "Ask";

  return {
    address: address.toBase58(),
    owner: order.owner.toBase58(),
    side,
    price: order.price.toString(),
    seq: order.seq.toString(),
    remainingHandle: order.remainingHandle.toString(),
    isOpen: order.isOpen === 1,
  };
};

export const useOrderbookOrders = (params: UseOrderbookOrdersParams = {}) => {
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
    queryKey: [
      "orderbook",
      "orders",
      statePda.toBase58(),
      params.includeClosed ? "all" : "open",
    ],
    queryFn: async () => {
      if (!program) {
        throw new Error("Orderbook program not available");
      }

      const orders = await program.account.order.all();
      const filtered = orders.filter((entry) => {
        const derived = deriveOrderPda(
          statePda,
          entry.account.owner,
          entry.account.seq,
        )[0];
        if (!derived.equals(entry.publicKey)) return false;
        if (params.includeClosed) return true;
        return entry.account.isOpen === 1;
      });

      const mapped = filtered.map((entry) =>
        toOrderView(entry.account, entry.publicKey),
      );

      mapped.sort((a, b) => {
        const aSeq = BigInt(a.seq);
        const bSeq = BigInt(b.seq);
        if (aSeq === bSeq) return 0;
        return aSeq > bSeq ? -1 : 1;
      });

      return mapped;
    },
    enabled: Boolean(program),
    staleTime: 1000 * 10,
    gcTime: 1000 * 60 * 5,
    refetchInterval: params.refetchInterval ?? 1000 * 20,
    refetchOnWindowFocus: false,
    retry: 1,
  });
};
