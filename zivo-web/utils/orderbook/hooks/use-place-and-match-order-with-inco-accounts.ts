import { useMutation } from "@tanstack/react-query";
import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js";
import { encryptValue } from "@inco/solana-sdk/encryption";
import BN from "bn.js";

import {
  deriveOrderPda,
  deriveOrderbookStatePda,
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
import type { PlaceAndMatchOrderWithIncoAccountsParams } from "./types";
import { getSplDecimalsForIncoMint } from "@/utils/mints";

type PlaceAndMatchOrderResult = {
  placeSignature: string;
  matchSignature: string;
  preSignatures?: string[];
  order: PublicKey;
  traderBaseInco: PublicKey;
  traderQuoteInco: PublicKey;
};

const API_ENDPOINT = "/api/orderbook/place-and-match";
const pow10 = (decimals: number): bigint => BigInt(10) ** BigInt(decimals);

export const usePlaceAndMatchOrderWithIncoAccounts = () => {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { publicKey, signAllTransactions } = useWallet();
  const program = useOrderbookProgram();

  return useMutation<PlaceAndMatchOrderResult, Error, PlaceAndMatchOrderWithIncoAccountsParams>(
    {
      mutationFn: async (params) => {
        if (!program || !wallet || !publicKey) {
          throw new Error("Wallet not connected");
        }
        if (!signAllTransactions) {
          throw new Error("Wallet does not support batch signing");
        }
        if (params.makerSide !== "Bid" && params.makerSide !== "Ask") {
          throw new Error("Invalid maker order side");
        }

        const amountValue = Number(params.amount);
        if (!Number.isFinite(amountValue) || amountValue <= 0) {
          throw new Error("Amount must be a positive number");
        }

        let priceInQuoteUnits: bigint;
        try {
          priceInQuoteUnits = BigInt(params.price);
        } catch {
          throw new Error("Invalid price for maker order");
        }

        const baseMint = params.baseMint ?? getDefaultBaseMint();
        const quoteMint = params.quoteMint ?? getDefaultQuoteMint();
        const [state] = deriveOrderbookStatePda(baseMint, quoteMint);
        const stateAccount = await fetchOrderbookState(program, state);

        const baseDecimals =
          (await fetchIncoMintDecimals(connection, stateAccount.incoBaseMint)) ??
          9;
        const quoteDecimals =
          (await fetchIncoMintDecimals(
            connection,
            stateAccount.incoQuoteMint,
          )) ?? 9;

        const baseAmount = BigInt(
          Math.floor(amountValue * Math.pow(10, baseDecimals)),
        );
        const quoteAmount =
          (baseAmount * priceInQuoteUnits) / pow10(baseDecimals);

        const sizeCiphertextHex = await encryptValue(baseAmount);
        const baseCiphertextHex = sizeCiphertextHex;
        const quoteCiphertextHex = await encryptValue(quoteAmount);

        const takerSide = params.makerSide === "Ask" ? 0 : 1;
        const placeSide = takerSide;
        const escrowAmount = placeSide === 0 ? quoteAmount : baseAmount;
        const escrowCiphertextHex = await encryptValue(escrowAmount);

        const [order] = deriveOrderPda(state, publicKey, stateAccount.orderSeq);

        const takerBaseInco = await findExistingIncoAccount(
          connection,
          publicKey,
          stateAccount.incoBaseMint,
        );
        const takerQuoteInco = await findExistingIncoAccount(
          connection,
          publicKey,
          stateAccount.incoQuoteMint,
        );
        if (!takerBaseInco || !takerQuoteInco) {
          throw new Error("Please initialize Inco accounts before trading");
        }

        const makerOwner = new PublicKey(params.makerOwner);
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

        const computeIx = ComputeBudgetProgram.setComputeUnitLimit({
          units: 400_000,
        });

        const wrapMint =
          takerSide === 0
            ? stateAccount.incoQuoteMint
            : stateAccount.incoBaseMint;
        const wrapSplDecimals = getSplDecimalsForIncoMint(
          wrapMint.toBase58(),
        );
        if (wrapSplDecimals == null) {
          throw new Error("Unsupported wrap mint for SPL decimals");
        }
        const priceUi =
          Number(priceInQuoteUnits) / Math.pow(10, quoteDecimals);
        const wrapAmountUi =
          takerSide === 0 ? amountValue * priceUi : amountValue;
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
            placeSide,
            new BN(priceInQuoteUnits.toString()),
            Buffer.from(sizeCiphertextHex, "hex"),
            0,
            Buffer.from(escrowCiphertextHex, "hex"),
            0,
          )
          .preInstructions([computeIx])
          .accounts({
            state,
            order,
            trader: publicKey,
            incoVaultAuthority: stateAccount.incoVaultAuthority,
            incoBaseVault: stateAccount.incoBaseVault,
            incoQuoteVault: stateAccount.incoQuoteVault,
            traderBaseInco: takerBaseInco,
            traderQuoteInco: takerQuoteInco,
            incoBaseMint: stateAccount.incoBaseMint,
            incoQuoteMint: stateAccount.incoQuoteMint,
            systemProgram: SystemProgram.programId,
            incoTokenProgram: INCO_TOKEN_PROGRAM_ID,
            incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
          })
          .transaction();

        const matchTx = await program.methods
          .matchOrder(
            takerSide,
            new BN(priceInQuoteUnits.toString()),
            Buffer.from(baseCiphertextHex, "hex"),
            Buffer.from(baseCiphertextHex, "hex"),
            Buffer.from(quoteCiphertextHex, "hex"),
            0,
          )
          .preInstructions([computeIx])
          .accounts({
            state,
            makerOrder: new PublicKey(params.makerOrderAddress),
            owner: makerOwner,
            matcher: stateAccount.admin,
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
            systemProgram: SystemProgram.programId,
            incoTokenProgram: INCO_TOKEN_PROGRAM_ID,
            incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
            instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
          })
          .transaction();

        const { blockhash } = await connection.getLatestBlockhash();
        wrapTx.recentBlockhash = blockhash;
        wrapTx.feePayer = publicKey;
        placeTx.recentBlockhash = blockhash;
        placeTx.feePayer = publicKey;
        matchTx.recentBlockhash = blockhash;
        matchTx.feePayer = publicKey;

        const [signedWrap, signedPlace, signedMatch] =
          await signAllTransactions([wrapTx, placeTx, matchTx]);

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
        const matchTxBase64 = Buffer.from(
          signedMatch.serialize({
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
            matchTx: matchTxBase64,
          }),
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => null);
          throw new Error(errorBody?.error ?? "Backend failed to submit txs");
        }

        const payload = (await response.json()) as {
          preSignatures?: string[];
          placeSignature: string;
          matchSignature: string;
        };

        return {
          placeSignature: payload.placeSignature,
          matchSignature: payload.matchSignature,
          preSignatures: payload.preSignatures,
          order,
          traderBaseInco: takerBaseInco,
          traderQuoteInco: takerQuoteInco,
        };
      },
    },
  );
};
