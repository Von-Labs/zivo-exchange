import { useMutation } from "@tanstack/react-query";

import { bumpOrderSeq, type BumpOrderSeqParams } from "../methods";
import { useOrderbookProgram } from "./use-orderbook-program";

export const useBumpOrderSeq = () => {
  const program = useOrderbookProgram();

  return useMutation({
    mutationFn: (params: Omit<BumpOrderSeqParams, "program">) => {
      if (!program) throw new Error("Orderbook program not available");
      return bumpOrderSeq({ program, ...params });
    },
  });
};
