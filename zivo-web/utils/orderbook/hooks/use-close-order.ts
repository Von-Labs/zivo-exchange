import { useMutation } from "@tanstack/react-query";

import { closeOrder, type CloseOrderParams } from "../methods";
import { useOrderbookProgram } from "./use-orderbook-program";

export const useCloseOrder = () => {
  const program = useOrderbookProgram();

  return useMutation({
    mutationFn: (params: Omit<CloseOrderParams, "program">) => {
      if (!program) throw new Error("Orderbook program not available");
      return closeOrder({ program, ...params });
    },
  });
};
