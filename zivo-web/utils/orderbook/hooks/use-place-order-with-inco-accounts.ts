import { useMutation } from "@tanstack/react-query";
import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { encryptValue } from "@inco/solana-sdk/encryption";

import {
  deriveOrderbookStatePda,
  deriveOrderPda,
  fetchOrderbookState,
  getDefaultBaseMint,
  getDefaultQuoteMint,
} from "../methods";
import { buildWrapTransaction } from "../build-wrap-transaction";
import { INCO_LIGHTNING_PROGRAM_ID, INCO_TOKEN_PROGRAM_ID } from "../constants";
import {
  fetchIncoMintDecimals,
  findExistingIncoAccount,
} from "./inco-accounts";
import { useOrderbookProgram } from "./use-orderbook-program";
import type { PlaceOrderWithIncoAccountsParams } from "./types";
import { getSplDecimalsForIncoMint } from "@/utils/mints";

const API_ENDPOINT = "/api/orderbook/place";

export const usePlaceOrderWithIncoAccounts = () => {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { publicKey, signAllTransactions } = useWallet();
  const program = useOrderbookProgram();

  return useMutation({
    mutationFn: async (
      params: PlaceOrderWithIncoAccountsParams,
    ): Promise<{
      signature: string;
      order: PublicKey;
      traderBaseInco: PublicKey;
      traderQuoteInco: PublicKey;
      preSignatures?: string[];
    }> => {
      if (!program || !wallet || !publicKey) {
        throw new Error("Wallet not connected");
      }
      if (!signAllTransactions) {
        throw new Error("Wallet does not support batch signing");
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
        null;
      const quoteDecimals =
        (await fetchIncoMintDecimals(connection, stateAccount.incoQuoteMint)) ??
        null;
      const resolvedBaseDecimals =
        baseDecimals && baseDecimals > 0
          ? baseDecimals
          : getSplDecimalsForIncoMint(
              stateAccount.incoBaseMint.toBase58(),
            ) ?? 9;
      const resolvedQuoteDecimals =
        quoteDecimals && quoteDecimals > 0
          ? quoteDecimals
          : getSplDecimalsForIncoMint(
              stateAccount.incoQuoteMint.toBase58(),
            ) ?? 9;

      const baseAmount = BigInt(
        Math.floor(amountValue * Math.pow(10, resolvedBaseDecimals)),
      );
      const quoteAmount = BigInt(
        Math.floor(amountValue * priceValue * Math.pow(10, resolvedQuoteDecimals)),
      );
      const priceInQuoteUnits = Math.floor(
        priceValue * Math.pow(10, resolvedQuoteDecimals),
      );

      const sizeCiphertextHex = await encryptValue(baseAmount);
      const escrowAmount = params.side === "sell" ? baseAmount : quoteAmount;
      const escrowCiphertextHex = await encryptValue(escrowAmount);

      const [order] = deriveOrderPda(state, publicKey, stateAccount.orderSeq);

      const baseIncoAccount = await findExistingIncoAccount(
        connection,
        publicKey,
        stateAccount.incoBaseMint,
      );
      const quoteIncoAccount = await findExistingIncoAccount(
        connection,
        publicKey,
        stateAccount.incoQuoteMint,
      );
      if (!baseIncoAccount || !quoteIncoAccount) {
        throw new Error("Please initialize Inco accounts before trading");
      }

      const wrapMint =
        params.side === "sell"
          ? stateAccount.incoBaseMint
          : stateAccount.incoQuoteMint;
      const wrapSplDecimals = getSplDecimalsForIncoMint(
        wrapMint.toBase58(),
      );
      if (wrapSplDecimals == null) {
        throw new Error("Unsupported wrap mint for SPL decimals");
      }

      const wrapAmountUi =
        params.side === "sell"
          ? amountValue
          : amountValue * priceValue;
      const wrapAmountLamports = BigInt(
        Math.floor(wrapAmountUi * Math.pow(10, wrapSplDecimals)),
      );

      const wrapTx = await buildWrapTransaction({
        connection,
        wallet,
        owner: publicKey,
        incoMint: wrapMint,
        amountLamports: wrapAmountLamports,
        feePayer: stateAccount.admin,
      });

      const placeTx = await program.methods
        .placeOrder(
          params.side === "buy" ? 0 : 1,
          new BN(priceInQuoteUnits.toString()),
          Buffer.from(sizeCiphertextHex, "hex"),
          0,
          Buffer.from(escrowCiphertextHex, "hex"),
          0,
        )
        .accounts({
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
          systemProgram: SystemProgram.programId,
          incoTokenProgram: INCO_TOKEN_PROGRAM_ID,
          incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
        })
        .transaction();

      const { blockhash } = await connection.getLatestBlockhash();
      wrapTx.recentBlockhash = blockhash;
      wrapTx.feePayer = publicKey;
      placeTx.recentBlockhash = blockhash;
      placeTx.feePayer = publicKey;

      const [signedWrap, signedPlace] = await signAllTransactions([
        wrapTx,
        placeTx,
      ]);

      const wrapTxBase64 = Buffer.from(
        signedWrap.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        }),
      ).toString("base64");
      const placeTxBase64 = Buffer.from(
        signedPlace.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        }),
      ).toString("base64");

      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          preTxs: [wrapTxBase64],
          placeTx: placeTxBase64,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.error ?? "Backend failed to submit txs");
      }

      const payload = (await response.json()) as {
        preSignatures?: string[];
        placeSignature: string;
      };

      return {
        signature: payload.placeSignature,
        preSignatures: payload.preSignatures,
        order,
        traderBaseInco: baseIncoAccount,
        traderQuoteInco: quoteIncoAccount,
      };
    },
  });
};
