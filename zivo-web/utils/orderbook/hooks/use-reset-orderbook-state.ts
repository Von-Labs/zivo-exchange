import { useMutation } from "@tanstack/react-query";

import { resetState, type ResetStateParams } from "../methods";
import { useOrderbookProgram } from "./use-orderbook-program";

export const useResetOrderbookState = () => {
  const program = useOrderbookProgram();

  return useMutation({
    mutationFn: (params: Omit<ResetStateParams, "program">) => {
      if (!program) throw new Error("Orderbook program not available");
      return resetState({ program, ...params });
    },
  });
};
