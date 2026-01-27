import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { getDefaultBaseMint, getDefaultQuoteMint } from "../methods";
import { findExistingIncoAccount } from "./inco-accounts";
import type { UseIncoAccountStatusParams } from "./types";

export type IncoAccountStatus = {
  baseIncoAccount: PublicKey | null;
  quoteIncoAccount: PublicKey | null;
  isInitialized: boolean;
};

export const useIncoAccountStatus = (
  params: UseIncoAccountStatusParams = {},
) => {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const baseMint = useMemo(
    () => params.baseMint ?? getDefaultBaseMint(),
    [params.baseMint?.toBase58()],
  );
  const quoteMint = useMemo(
    () => params.quoteMint ?? getDefaultQuoteMint(),
    [params.quoteMint?.toBase58()],
  );

  return useQuery({
    queryKey: [
      "orderbook",
      "inco-accounts",
      publicKey?.toBase58() ?? "disconnected",
      baseMint.toBase58(),
      quoteMint.toBase58(),
    ],
    queryFn: async (): Promise<IncoAccountStatus> => {
      if (!publicKey) {
        throw new Error("Wallet not connected");
      }

      const baseIncoAccount = await findExistingIncoAccount(
        connection,
        publicKey,
        baseMint,
      );
      const quoteIncoAccount = await findExistingIncoAccount(
        connection,
        publicKey,
        quoteMint,
      );

      return {
        baseIncoAccount,
        quoteIncoAccount,
        isInitialized: Boolean(baseIncoAccount && quoteIncoAccount),
      };
    },
    enabled: Boolean(publicKey),
    staleTime: 1000 * 15,
    gcTime: 1000 * 60 * 5,
    refetchInterval: params.refetchInterval ?? 1000 * 20,
    refetchOnWindowFocus: false,
    retry: 1,
  });
};
