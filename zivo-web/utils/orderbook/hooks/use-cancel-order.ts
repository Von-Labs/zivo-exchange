import { useMutation } from "@tanstack/react-query";

import { cancelOrder, type CancelOrderParams } from "../methods";
import { useOrderbookProgram } from "./use-orderbook-program";

export const useCancelOrder = () => {
  const program = useOrderbookProgram();

  return useMutation({
    mutationFn: (params: Omit<CancelOrderParams, "program">) => {
      if (!program) throw new Error("Orderbook program not available");
      return cancelOrder({ program, ...params });
    },
  });
};
