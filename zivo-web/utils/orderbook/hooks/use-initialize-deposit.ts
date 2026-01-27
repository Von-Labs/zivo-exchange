import { useMutation } from "@tanstack/react-query";

import { initializeDeposit, type InitializeDepositParams } from "../methods";
import { useOrderbookProgram } from "./use-orderbook-program";

export const useInitializeDeposit = () => {
  const program = useOrderbookProgram();

  return useMutation({
    mutationFn: (params: Omit<InitializeDepositParams, "program">) => {
      if (!program) throw new Error("Orderbook program not available");
      return initializeDeposit({ program, ...params });
    },
  });
};
