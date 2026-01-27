import { useMutation } from "@tanstack/react-query";

import { placeOrder, type PlaceOrderParams } from "../methods";
import { useOrderbookProgram } from "./use-orderbook-program";

export const usePlaceOrder = () => {
  const program = useOrderbookProgram();

  return useMutation({
    mutationFn: (params: Omit<PlaceOrderParams, "program">) => {
      if (!program) throw new Error("Orderbook program not available");
      return placeOrder({ program, ...params });
    },
  });
};
