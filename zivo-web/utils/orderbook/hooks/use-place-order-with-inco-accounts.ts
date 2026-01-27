import { useMutation } from "@tanstack/react-query";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { PublicKey } from "@solana/web3.js";
import { encryptValue } from "@inco/solana-sdk/encryption";

import {
  deriveOrderbookStatePda,
  deriveOrderPda,
  fetchOrderbookState,
  getDefaultBaseMint,
  getDefaultQuoteMint,
  placeOrder,
  type PlaceOrderParams,
} from "../methods";
import { ensureIncoAccount, fetchIncoMintDecimals } from "./inco-accounts";
import { useOrderbookProgram } from "./use-orderbook-program";
import type { PlaceOrderWithIncoAccountsParams } from "./types";

export const usePlaceOrderWithIncoAccounts = () => {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { publicKey } = useWallet();
  const program = useOrderbookProgram();

  return useMutation({
    mutationFn: async (
      params: PlaceOrderWithIncoAccountsParams,
    ): Promise<{
      signature: string;
      order: PublicKey;
      traderBaseInco: PublicKey;
      traderQuoteInco: PublicKey;
    }> => {
      if (!program || !wallet || !publicKey) {
        throw new Error("Wallet not connected");
      }

      const amountValue = Number(params.amount);
      const priceValue = Number(params.price);
      if (!Number.isFinite(amountValue) || amountValue <= 0) {
        throw new Error("Amount must be a positive number");
      }
      if (!Number.isFinite(priceValue) || priceValue <= 0) {
        throw new Error("Price must be a positive number");
      }

      const baseMint = params.baseMint ?? getDefaultBaseMint();
      const quoteMint = params.quoteMint ?? getDefaultQuoteMint();
      const [state] = deriveOrderbookStatePda(baseMint, quoteMint);
      const stateAccount = await fetchOrderbookState(program, state);

      const baseDecimals =
        (await fetchIncoMintDecimals(connection, stateAccount.incoBaseMint)) ??
        9;
      const quoteDecimals =
        (await fetchIncoMintDecimals(connection, stateAccount.incoQuoteMint)) ??
        9;

      const baseAmount = BigInt(
        Math.floor(amountValue * Math.pow(10, baseDecimals)),
      );
      const quoteAmount = BigInt(
        Math.floor(amountValue * priceValue * Math.pow(10, quoteDecimals)),
      );
      const priceInQuoteUnits = Math.floor(
        priceValue * Math.pow(10, quoteDecimals),
      );

      const sizeCiphertextHex = await encryptValue(baseAmount);
      const escrowAmount = params.side === "sell" ? baseAmount : quoteAmount;
      const escrowCiphertextHex = await encryptValue(escrowAmount);

      const [order] = deriveOrderPda(state, publicKey, stateAccount.orderSeq);

      const baseIncoAccount = await ensureIncoAccount({
        connection,
        wallet,
        owner: publicKey,
        mint: stateAccount.incoBaseMint,
      });
      const quoteIncoAccount = await ensureIncoAccount({
        connection,
        wallet,
        owner: publicKey,
        mint: stateAccount.incoQuoteMint,
      });

      const signature = await placeOrder({
        program,
        state,
        order,
        trader: publicKey,
        incoVaultAuthority: stateAccount.incoVaultAuthority,
        incoBaseVault: stateAccount.incoBaseVault,
        incoQuoteVault: stateAccount.incoQuoteVault,
        traderBaseInco: baseIncoAccount,
        traderQuoteInco: quoteIncoAccount,
        incoBaseMint: stateAccount.incoBaseMint,
        incoQuoteMint: stateAccount.incoQuoteMint,
        side: params.side === "buy" ? 0 : 1,
        price: priceInQuoteUnits,
        sizeCiphertext: Buffer.from(sizeCiphertextHex, "hex"),
        inputType: 0,
        escrowCiphertext: Buffer.from(escrowCiphertextHex, "hex"),
        escrowInputType: 0,
      } as PlaceOrderParams);

      return {
        signature,
        order,
        traderBaseInco: baseIncoAccount,
        traderQuoteInco: quoteIncoAccount,
      };
    },
  });
};
