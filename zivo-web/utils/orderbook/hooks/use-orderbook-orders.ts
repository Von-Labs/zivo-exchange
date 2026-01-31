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

const readBool = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  return undefined;
};

const toOrderView = (order: OrderAccount, address: PublicKey): OrderView => {
  let side: OrderView["side"] = "Unknown";
  if (order.side === 0) side = "Bid";
  if (order.side === 1) side = "Ask";

  const anyOrder = order as unknown as {
    isOpen?: boolean | number;
    isFilled?: boolean | number;
    is_filled?: boolean | number;
    isClaimed?: boolean | number;
    is_claimed?: boolean | number;
    claimPlaintextAmount?: { toString?: () => string };
    claim_plaintext_amount?: { toString?: () => string };
  };
  const isOpenValue = readBool(anyOrder.isOpen);
  const filledValue =
    readBool(anyOrder.isFilled) ?? readBool(anyOrder.is_filled);
  const claimedValue =
    readBool(anyOrder.isClaimed) ?? readBool(anyOrder.is_claimed);
  const claimPlaintextAmount =
    anyOrder.claimPlaintextAmount?.toString?.() ??
    anyOrder.claim_plaintext_amount?.toString?.();

  return {
    address: address.toBase58(),
    owner: order.owner.toBase58(),
    side,
    price: order.price.toString(),
    seq: order.seq.toString(),
    remainingHandle: order.remainingHandle.toString(),
    isOpen: isOpenValue ?? false,
    isFilled: filledValue,
    isClaimed: claimedValue,
    claimPlaintextAmount,
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
        return readBool(entry.account.isOpen) ?? false;
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
