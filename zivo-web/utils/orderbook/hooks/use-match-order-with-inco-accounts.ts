import { useMutation } from "@tanstack/react-query";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { encryptValue } from "@inco/solana-sdk/encryption";

import {
  deriveOrderbookStatePda,
  fetchOrderbookState,
  getDefaultBaseMint,
  getDefaultQuoteMint,
  type MatchOrderParams,
} from "../methods";
import {
  ensureIncoAccount,
  fetchIncoMintDecimals,
  findExistingIncoAccount,
} from "./inco-accounts";
import { useMatchOrder } from "./use-match-order";
import { useOrderbookProgram } from "./use-orderbook-program";

export type MatchOrderWithIncoAccountsParams = {
  orderAddress: string;
  owner: string;
  side: "Bid" | "Ask";
  price: string;
  amount: string;
  baseMint?: PublicKey;
  quoteMint?: PublicKey;
};

const pow10 = (decimals: number): bigint => BigInt(10) ** BigInt(decimals);

export const useMatchOrderWithIncoAccounts = () => {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { publicKey } = useWallet();
  const program = useOrderbookProgram();
  const matchOrder = useMatchOrder();

  return useMutation({
    mutationFn: async (params: MatchOrderWithIncoAccountsParams) => {
      if (!program || !wallet || !publicKey) {
        throw new Error("Wallet not connected");
      }

      const amountValue = Number(params.amount);
      if (!Number.isFinite(amountValue) || amountValue <= 0) {
        throw new Error("Amount must be a positive number");
      }

      const baseMint = params.baseMint ?? getDefaultBaseMint();
      const quoteMint = params.quoteMint ?? getDefaultQuoteMint();
      const [state] = deriveOrderbookStatePda(baseMint, quoteMint);
      const stateAccount = await fetchOrderbookState(program, state);

      if (!stateAccount.admin.equals(publicKey)) {
        throw new Error("Only the orderbook admin can match orders");
      }

      const baseDecimals =
        (await fetchIncoMintDecimals(connection, stateAccount.incoBaseMint)) ??
        9;

      const baseAmount = BigInt(
        Math.floor(amountValue * Math.pow(10, baseDecimals)),
      );
      const priceInQuoteUnits = BigInt(params.price);
      const quoteAmount =
        (baseAmount * priceInQuoteUnits) / pow10(baseDecimals);

      const baseCiphertextHex = await encryptValue(baseAmount);
      const quoteCiphertextHex = await encryptValue(quoteAmount);

      const makerOwner = new PublicKey(params.owner);
      const makerBaseInco = await findExistingIncoAccount(
        connection,
        makerOwner,
        stateAccount.incoBaseMint,
      );
      if (!makerBaseInco) {
        throw new Error("Maker base Inco account not found");
      }
      const makerQuoteInco = await findExistingIncoAccount(
        connection,
        makerOwner,
        stateAccount.incoQuoteMint,
      );
      if (!makerQuoteInco) {
        throw new Error("Maker quote Inco account not found");
      }

      const takerBaseInco = await ensureIncoAccount({
        connection,
        wallet,
        owner: publicKey,
        mint: stateAccount.incoBaseMint,
      });
      const takerQuoteInco = await ensureIncoAccount({
        connection,
        wallet,
        owner: publicKey,
        mint: stateAccount.incoQuoteMint,
      });

      const takerSide = params.side === "Ask" ? 0 : 1;

      return matchOrder.mutateAsync({
        state,
        makerOrder: new PublicKey(params.orderAddress),
        owner: makerOwner,
        matcher: publicKey,
        taker: publicKey,
        incoVaultAuthority: stateAccount.incoVaultAuthority,
        incoBaseVault: stateAccount.incoBaseVault,
        incoQuoteVault: stateAccount.incoQuoteVault,
        makerBaseInco,
        makerQuoteInco,
        takerBaseInco,
        takerQuoteInco,
        incoBaseMint: stateAccount.incoBaseMint,
        incoQuoteMint: stateAccount.incoQuoteMint,
        takerSide,
        takerPrice: priceInQuoteUnits,
        takerReqBaseCiphertext: Buffer.from(baseCiphertextHex, "hex"),
        fillBaseCiphertext: Buffer.from(baseCiphertextHex, "hex"),
        fillQuoteCiphertext: Buffer.from(quoteCiphertextHex, "hex"),
        inputType: 0,
      } satisfies Omit<MatchOrderParams, "program">);
    },
  });
};
