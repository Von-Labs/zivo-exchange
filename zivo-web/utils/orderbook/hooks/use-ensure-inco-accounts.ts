import { useMutation } from "@tanstack/react-query";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";

import { getDefaultBaseMint, getDefaultQuoteMint } from "../methods";
import { ensureIncoAccount } from "./inco-accounts";
import type { EnsureIncoAccountsParams, EnsureIncoAccountsResult } from "./types";

export const useEnsureIncoAccounts = () => {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { publicKey } = useWallet();

  return useMutation({
    mutationFn: async (
      params: EnsureIncoAccountsParams = {},
    ): Promise<EnsureIncoAccountsResult> => {
      if (!wallet || !publicKey) {
        throw new Error("Wallet not connected");
      }

      const baseMint = params.baseMint ?? getDefaultBaseMint();
      const quoteMint = params.quoteMint ?? getDefaultQuoteMint();

      const baseIncoAccount = await ensureIncoAccount({
        connection,
        wallet,
        owner: publicKey,
        mint: baseMint,
      });

      const quoteIncoAccount = await ensureIncoAccount({
        connection,
        wallet,
        owner: publicKey,
        mint: quoteMint,
      });

      return { baseIncoAccount, quoteIncoAccount };
    },
  });
};
