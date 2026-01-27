import { useMemo } from "react";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";

import { getOrderbookProgram } from "../program";

export const useOrderbookProgram = () => {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  return useMemo(() => {
    if (!wallet) return null;
    return getOrderbookProgram(connection, wallet);
  }, [connection, wallet]);
};
