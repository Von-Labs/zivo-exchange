"use client";

import { useEffect, useMemo, useState } from "react";
import debounce from "lodash.debounce";
import {
  useIncoAccountStatus,
  useOrderbookOrders,
  useOrderbookProgram,
  useOrderbookState,
  useResetOrderbookState,
  type OrderView,
} from "@/utils/orderbook";
import {
  deriveOrderbookStatePda,
  getDefaultBaseMint,
  getDefaultQuoteMint,
} from "@/utils/orderbook/methods";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useQueryClient } from "@tanstack/react-query";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { createCloseAccountInstruction } from "@solana/spl-token";
import { buildUnwrapTransaction } from "@/utils/orderbook/build-wrap-transaction";
import { getSplDecimalsForIncoMint, SPL_WRAPPED_SOL_MINT } from "@/utils/mints";
import {
  INCO_LIGHTNING_PROGRAM_ID,
  INCO_TOKEN_PROGRAM_ID,
} from "@/utils/constants";
import { findExistingIncoAccount } from "@/utils/orderbook/hooks/inco-accounts";

const OrdersPanel = () => {
  const program = useOrderbookProgram();
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const queryClient = useQueryClient();
  const resetOrderbookState = useResetOrderbookState();
  const anchorWallet = useAnchorWallet();
  const [claimNotice, setClaimNotice] = useState<string | null>(null);
  const [claimPending, setClaimPending] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const {
    data: orderbookState,
    status,
    error,
    dataUpdatedAt,
  } = useOrderbookState();
  const {
    data: orders,
    status: ordersStatus,
    error: ordersError,
    dataUpdatedAt: ordersUpdatedAt,
    refetch: refetchOrders,
  } = useOrderbookOrders({ includeClosed: true });
  const {
    data: incoStatus,
    status: incoStatusState,
    error: incoStatusError,
  } = useIncoAccountStatus();

  const baseMint = useMemo(() => getDefaultBaseMint(), []);
  const quoteMint = useMemo(() => getDefaultQuoteMint(), []);
  const [derivedStatePda] = useMemo(
    () => deriveOrderbookStatePda(baseMint, quoteMint),
    [baseMint, quoteMint],
  );

  useEffect(() => {
    if (error) {
      console.error("Failed to fetch orderbook state", error);
    }
  }, [error]);

  useEffect(() => {
    if (ordersError) {
      console.error("Failed to fetch orderbook orders", ordersError);
    }
  }, [ordersError]);

  useEffect(() => {
    if (incoStatusError) {
      console.error("Failed to fetch Inco account status", incoStatusError);
    }
  }, [incoStatusError]);

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["orderbook", "orders"] });
  }, [publicKey?.toBase58(), queryClient]);


  const latestUpdatedAt = Math.max(dataUpdatedAt ?? 0, ordersUpdatedAt ?? 0);

  const helperText = useMemo(() => {
    if (!program) return "Connect your wallet to view live activity.";
    if (status === "pending" || ordersStatus === "pending") {
      return "Loading orderbook state...";
    }
    if (status === "error" || ordersStatus === "error") {
      return "Unable to load orderbook state right now.";
    }
    if (!orderbookState) return "No orderbook state yet.";
    if (latestUpdatedAt) {
      return `Last updated ${new Date(latestUpdatedAt).toLocaleTimeString(
        "en-US",
        {
          hour: "2-digit",
          minute: "2-digit",
        },
      )}.`;
    }
    return "Orderbook state is synced.";
  }, [latestUpdatedAt, orderbookState, ordersStatus, program, status]);

  const rows = useMemo(() => {
    if (!orders || orders.length === 0) return [];
    const quoteDecimals =
      orderbookState?.incoQuoteMint
        ? getSplDecimalsForIncoMint(orderbookState.incoQuoteMint)
        : null;
    const formatPrice = (value: string): string => {
      if (quoteDecimals == null) return value;
      try {
        const raw = BigInt(value);
        if (quoteDecimals <= 0) return raw.toString();
        const padded = raw.toString().padStart(quoteDecimals + 1, "0");
        const whole = padded.slice(0, -quoteDecimals);
        const fraction = padded.slice(-quoteDecimals).replace(/0+$/g, "");
        return fraction ? `${whole}.${fraction}` : whole;
      } catch {
        return value;
      }
    };
    return orders.map((order: OrderView) => ({
      address: order.address,
      side: order.side,
      owner: order.owner,
      price: formatPrice(order.price),
      remainingHandle: order.remainingHandle,
      seq: order.seq,
      isOpen: order.isOpen,
      isFilled: order.isFilled,
      isClaimed: order.isClaimed,
      claimPlaintextAmount: order.claimPlaintextAmount,
    }));
  }, [orders, orderbookState?.incoQuoteMint]);

  const handleClaim = async (order: OrderView) => {
    if (!publicKey || !anchorWallet) {
      setClaimNotice("Connect your wallet to claim.");
      return;
    }
    if (!program) {
      setClaimNotice("Orderbook program not available.");
      return;
    }

    const incoMint =
      order.side === "Bid"
        ? orderbookState.incoBaseMint
        : order.side === "Ask"
          ? orderbookState.incoQuoteMint
          : null;
    if (!incoMint) {
      setClaimNotice("Unsupported order side for claim.");
      return;
    }

    if (!order.claimPlaintextAmount) {
      setClaimNotice("Claim amount not available for this order.");
      return;
    }
    const amountLamports = BigInt(order.claimPlaintextAmount);
    if (amountLamports <= 0n) {
      setClaimNotice("Claim amount is zero for this order.");
      return;
    }

    setClaimPending(true);
    setClaimNotice(null);
    try {
      const orderAddress = new PublicKey(order.address);
      const orderOwner = new PublicKey(order.owner);
      const statePda = derivedStatePda;

      const makerBaseInco = await findExistingIncoAccount(
        connection,
        publicKey,
        new PublicKey(orderbookState.incoBaseMint),
      );
      const makerQuoteInco = await findExistingIncoAccount(
        connection,
        publicKey,
        new PublicKey(orderbookState.incoQuoteMint),
      );
      if (!makerBaseInco || !makerQuoteInco) {
        throw new Error("Initialize Inco accounts before claiming.");
      }

      const claimIx = await program.methods
        .makerClaimFilledOrder()
        .accounts({
          state: statePda,
          order: orderAddress,
          owner: orderOwner,
          maker: publicKey,
          incoVaultAuthority: new PublicKey(orderbookState.incoVaultAuthority),
          incoBaseVault: new PublicKey(orderbookState.incoBaseVault),
          incoQuoteVault: new PublicKey(orderbookState.incoQuoteVault),
          makerBaseInco,
          makerQuoteInco,
          incoBaseMint: new PublicKey(orderbookState.incoBaseMint),
          incoQuoteMint: new PublicKey(orderbookState.incoQuoteMint),
          systemProgram: SystemProgram.programId,
          incoTokenProgram: INCO_TOKEN_PROGRAM_ID,
          incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
        })
        .instruction();

      const unwrapBuild = await buildUnwrapTransaction({
        connection,
        wallet: anchorWallet,
        owner: publicKey,
        incoMint: new PublicKey(incoMint),
        amountLamports,
        feePayer: publicKey,
      });

      const tx = new Transaction();
      tx.add(claimIx, ...unwrapBuild.tx.instructions);
      if (unwrapBuild.splTokenMint.toBase58() === SPL_WRAPPED_SOL_MINT) {
        tx.add(
          createCloseAccountInstruction(
            unwrapBuild.userSplAccount,
            publicKey,
            publicKey,
          ),
        );
      }

      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction(signature, "confirmed");
      setClaimNotice("Claim and unwrap submitted successfully.");
      window.dispatchEvent(
        new CustomEvent("zivo:toast", {
          detail: {
            message: "Claim and unwrap submitted successfully.",
            signatures: [
              { label: "Claim + Unwrap", signature },
            ],
          },
        }),
      );
      refetchOrders();
    } catch (err) {
      setClaimNotice(
        err instanceof Error ? err.message : "Failed to claim/unwrap tokens.",
      );
    } finally {
      setClaimPending(false);
    }
  };

  const handleResetOrderbook = async () => {
    if (!publicKey || !orderbookState) return;
    setResetPending(true);
    try {
      await resetOrderbookState.mutateAsync({
        state: derivedStatePda,
        admin: publicKey,
      });
      queryClient.invalidateQueries({ queryKey: ["orderbook", "orders"] });
    } finally {
      setResetPending(false);
    }
  };

  const debouncedReset = useMemo(
    () => debounce(handleResetOrderbook, 300),
    [],
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Orders
          </p>
          <h2 className="text-lg font-semibold text-slate-900">
            Orderbook State
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
          <button
            type="button"
            onClick={debouncedReset}
            disabled={resetPending}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            title="Reload orderbook (admin only)"
          >
            {resetPending ? "Reloading..." : "Reload"}
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        {!publicKey ? (
          <p>Connect your wallet to check Inco account setup.</p>
        ) : incoStatusState === "pending" ? (
          <p>Checking Inco account status...</p>
        ) : incoStatusState === "error" ? (
          <p>Unable to check Inco account status right now.</p>
        ) : incoStatus?.isInitialized ? (
          <p className="text-emerald-700">
            Inco accounts are initialized for this wallet.
          </p>
        ) : (
          <p className="text-rose-700">
            Inco accounts are not initialized. Initialize them before trading.
          </p>
        )}
      </div>
      {claimNotice ? (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-600">
          {claimNotice}
        </div>
      ) : null}
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
        <div className="grid grid-cols-6 gap-4 bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          <span>Side</span>
          <span>Owner</span>
          <span>Price</span>
          <span>Amount (ENCRYPTED)</span>
          <span>Time (seq)</span>
          <span>Status</span>
        </div>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-sm text-slate-500">
            <span className="text-base font-semibold text-slate-700">
              No open orders
            </span>
            <span className="text-xs text-slate-400">{helperText}</span>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((row: (typeof rows)[number], index: number) => (
              <div
                key={`${row.address}-${index}`}
                className="grid grid-cols-6 gap-4 px-4 py-3 text-sm text-slate-700"
              >
                <span
                  className={
                    row.side === "Bid"
                      ? "text-emerald-600"
                      : row.side === "Ask"
                        ? "text-rose-600"
                        : "text-slate-500"
                  }
                >
                  {row.side === "Bid"
                    ? "Buy"
                    : row.side === "Ask"
                      ? "Sell"
                      : "Unknown"}
                </span>
                <span className="truncate">{row.owner}</span>
                <span className="font-semibold text-slate-900">
                  {row.price}
                </span>
                <span className="truncate text-slate-500">
                  {row.remainingHandle}
                </span>
                <span className="text-slate-500">{row.seq}</span>
                <span className="flex items-center gap-2">
                  <span
                    className={
                      row.isFilled
                        ? "rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet-800"
                        : row.isOpen
                          ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-800"
                          : "rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                    }
                  >
                    {row.isFilled ? "Filled" : row.isOpen ? "Open" : "Closed"}
                  </span>
                  {row.isFilled === true &&
                  row.isOpen === false &&
                  row.isClaimed !== true &&
                  row.claimPlaintextAmount != null &&
                  BigInt(row.claimPlaintextAmount) > 0n &&
                  publicKey &&
                  row.owner === publicKey.toBase58() ? (
                    <button
                      type="button"
                      onClick={() => handleClaim(row)}
                      disabled={claimPending}
                      className="rounded-full border border-amber-300 bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900 shadow-sm transition hover:border-amber-400 hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {claimPending ? "Claiming..." : "Claim"}
                    </button>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      {orderbookState ? (
        <div className="mt-4 grid gap-3 text-xs text-slate-500 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="uppercase tracking-[0.2em] text-slate-400">Counts</p>
            <p className="mt-2 text-sm text-slate-700">
              Seq {orderbookState.orderSeq} · Bids {orderbookState.bidCount} ·
              Asks {orderbookState.askCount}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Last match handle {orderbookState.lastMatchHandle}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="uppercase tracking-[0.2em] text-slate-400">Vaults</p>
            <p className="mt-2 text-xs text-slate-500">
              Base mint {orderbookState.incoBaseMint}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Quote mint {orderbookState.incoQuoteMint}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Base vault {orderbookState.incoBaseVault}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Quote vault {orderbookState.incoQuoteVault}
            </p>
          </div>
          <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-3">
            {/* <p className="uppercase tracking-[0.2em] text-slate-400">Debug</p>
            <p className="mt-2 text-xs text-slate-500">
              Derived state {derivedStatePda.toBase58()}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Default base mint {baseMint.toBase58()}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Default quote mint {quoteMint.toBase58()}
            </p> */}
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default OrdersPanel;
