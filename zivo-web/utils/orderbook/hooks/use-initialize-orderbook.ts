import { useMutation } from "@tanstack/react-query";

import { initializeOrderbook, type InitializeOrderbookParams } from "../methods";
import { useOrderbookProgram } from "./use-orderbook-program";

export const useInitializeOrderbook = () => {
  const program = useOrderbookProgram();

  return useMutation({
    mutationFn: (params: Omit<InitializeOrderbookParams, "program">) => {
      if (!program) throw new Error("Orderbook program not available");
      return initializeOrderbook({ program, ...params });
    },
  });
};
