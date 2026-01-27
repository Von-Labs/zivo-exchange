import { useMutation } from "@tanstack/react-query";

import { matchOrder, type MatchOrderParams } from "../methods";
import { useOrderbookProgram } from "./use-orderbook-program";

export const useMatchOrder = () => {
  const program = useOrderbookProgram();

  return useMutation({
    mutationFn: (params: Omit<MatchOrderParams, "program">) => {
      if (!program) throw new Error("Orderbook program not available");
      return matchOrder({ program, ...params });
    },
  });
};
