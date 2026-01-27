"use client";

import priceFeedsData from "@/data/pyth_lazer_list.json";
import { useMagicblockWebSocket } from "@/utils/hooks";
import {
  useEnsureIncoAccounts,
  useOrderbookProgram,
  usePlaceOrderWithIncoAccounts,
} from "@/utils/orderbook";
import { getDefaultBaseMint } from "@/utils/orderbook/methods";
import { findExistingIncoAccount } from "@/utils/orderbook/hooks/inco-accounts";
import { extractHandle, getAllowancePda } from "@/utils/constants";
import type { PriceFeed } from "@/utils/types";
import debounce from "lodash/debounce";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import TradeAmountHeader from "@/components/exchange/trade-amount-header";
import Link from "next/link";

type TradeFormValues = {
  amount: string;
  price: string;
};

type OrderNotice = {
  type: "success" | "error";
  message: string;
};

type WrapStatus =
  | { status: "checking" }
  | { status: "ready" }
  | { status: "needs-wrap" }
  | { status: "error"; message: string };

const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";

const normalizeFeedPrice = (
  raw: number | null,
  feed?: PriceFeed,
): number | null => {
  if (raw == null || !feed) return null;
  return raw / Math.pow(10, Math.abs(feed.exponent));
};

const formatPriceInput = (value: number): string => {
  const decimals = value <= 100 ? 6 : 3;
  return value.toFixed(decimals);
};

const formatUsd = (value: number): string => {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const TradePanel = () => {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const { register, watch, setValue, formState } = useForm<TradeFormValues>({
    defaultValues: { amount: "", price: "" },
  });
  const amount = watch("amount");
  const price = watch("price");
  const program = useOrderbookProgram();
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const ensureIncoAccounts = useEnsureIncoAccounts();
  const placeOrderWithIncoAccounts = usePlaceOrderWithIncoAccounts();
  const [orderNotice, setOrderNotice] = useState<OrderNotice | null>(null);
  const [wrapStatus, setWrapStatus] = useState<WrapStatus>({
    status: "checking",
  });
  const [wrapRefreshTick, setWrapRefreshTick] = useState(0);
  const priceFeeds = priceFeedsData as PriceFeed[];
  const solFeed = priceFeeds.find((feed) => feed.name === "SOLUSD");
  const usdcFeed = priceFeeds.find((feed) => feed.name === "USDCUSD");

  const {
    price: solRaw,
    isConnected: solConnected,
    isConnecting: solConnecting,
  } = useMagicblockWebSocket(solFeed);
  const {
    price: usdcRaw,
    isConnected: usdcConnected,
    isConnecting: usdcConnecting,
  } = useMagicblockWebSocket(usdcFeed);

  const solUsd = normalizeFeedPrice(solRaw, solFeed);
  const usdcUsd = normalizeFeedPrice(usdcRaw, usdcFeed);
  const livePrice = useMemo(() => {
    if (solUsd == null || usdcUsd == null || usdcUsd === 0) return null;
    return solUsd / usdcUsd;
  }, [solUsd, usdcUsd]);
  const debouncedPriceUpdate = useMemo(
    () =>
      debounce(
        (nextPrice: number, currentPrice: string, isUserEditing?: boolean) => {
          if (!isUserEditing || currentPrice.trim() === "") {
            setValue("price", formatPriceInput(nextPrice), {
              shouldDirty: false,
              shouldTouch: false,
            });
          }
        },
        1000,
      ),
    [setValue],
  );

  useEffect(() => {
    if (livePrice == null) return;
    debouncedPriceUpdate(livePrice, price, formState.dirtyFields.price);
    return () => {
      debouncedPriceUpdate.cancel();
    };
  }, [debouncedPriceUpdate, formState.dirtyFields.price, livePrice, price]);

  const refreshWrapStatus = useCallback(async () => {
    if (!publicKey) {
      setWrapStatus({ status: "needs-wrap" });
      return;
    }

    setWrapStatus({ status: "checking" });

    try {
      const baseMint = getDefaultBaseMint();
      const baseIncoAccount = await findExistingIncoAccount(
        connection,
        publicKey,
        baseMint,
      );

      if (!baseIncoAccount) {
        setWrapStatus({ status: "needs-wrap" });
        return;
      }

      const accountInfo = await connection.getAccountInfo(baseIncoAccount);
      if (!accountInfo) {
        setWrapStatus({ status: "needs-wrap" });
        return;
      }

      const handle = extractHandle(accountInfo.data as Buffer);
      const [allowancePda] = getAllowancePda(handle, publicKey);
      const allowanceInfo = await connection.getAccountInfo(allowancePda);

      setWrapStatus(allowanceInfo ? { status: "ready" } : { status: "needs-wrap" });
    } catch (err) {
      setWrapStatus({
        status: "error",
        message: err instanceof Error ? err.message : "Unable to check wrap status.",
      });
    }
  }, [connection, publicKey]);

  useEffect(() => {
    refreshWrapStatus();
  }, [refreshWrapStatus, wrapRefreshTick]);

  useEffect(() => {
    const handleFocus = () => {
      setWrapRefreshTick((tick) => tick + 1);
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  const orderValue = useMemo(() => {
    const amountValue = Number(amount);
    const priceValue = Number(price);
    if (!Number.isFinite(amountValue) || !Number.isFinite(priceValue))
      return null;
    if (amountValue <= 0 || priceValue <= 0) return null;
    return amountValue * priceValue;
  }, [amount, price]);

  const priceStatus =
    livePrice != null && solConnected && usdcConnected
      ? "LIVE"
      : solConnecting || usdcConnecting
        ? "SYNC"
        : "OFFLINE";
  const priceStatusClass =
    priceStatus === "LIVE"
      ? "bg-emerald-100 text-emerald-700"
      : priceStatus === "SYNC"
        ? "bg-amber-100 text-amber-700"
        : "bg-rose-100 text-rose-700";
  const isSell = side === "sell";
  const actionLabel = isSell ? "Ask SOL" : "Bid SOL";
  const actionButtonClass = isSell
    ? "bg-rose-600 hover:bg-rose-500"
    : "bg-emerald-600 hover:bg-emerald-500";
  const canPlaceOrder =
    wrapStatus.status === "ready" &&
    !!program &&
    !!publicKey &&
    !placeOrderWithIncoAccounts.isPending;

  const handleInitializeIncoAccounts = async () => {
    setOrderNotice(null);
    try {
      await ensureIncoAccounts.mutateAsync();
      await refreshWrapStatus();
    } catch (err) {
      setOrderNotice({
        type: "error",
        message:
          err instanceof Error ? err.message : "Failed to initialize accounts.",
      });
    }
  };

  const handlePlaceOrder = async () => {
    setOrderNotice(null);
    if (wrapStatus.status !== "ready") {
      setOrderNotice({
        type: "error",
        message: "Wrap SOL to Inco before placing orders.",
      });
      return;
    }
    try {
      await placeOrderWithIncoAccounts.mutateAsync({
        side,
        amount,
        price,
      });
      setValue("amount", "", {
        shouldDirty: true,
        shouldTouch: true,
      });
      setOrderNotice({
        type: "success",
        message: "Order placed successfully.",
      });
    } catch (err) {
      setOrderNotice({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to place order.",
      });
    }
  };

  return (
    <section className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Trade
          </p>
          <h2 className="text-lg font-semibold text-slate-900">
            Trade SOL / USDC
          </h2>
        </div>
        <div className="relative flex items-center rounded-full border border-slate-200 bg-slate-50 p-1 text-xs font-semibold">
          <span
            className={`absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-white shadow-sm transition-transform duration-300 ease-out ${
              side === "sell" ? "translate-x-full" : "translate-x-0"
            }`}
          />
          <button
            type="button"
            onClick={() => setSide("buy")}
            className={`relative z-10 rounded-full px-4 py-1 transition-colors ${
              side === "buy" ? "text-slate-900" : "text-slate-500"
            }`}
          >
            Bid
          </button>
          <button
            type="button"
            onClick={() => setSide("sell")}
            className={`relative z-10 rounded-full px-4 py-1 transition-colors ${
              side === "sell" ? "text-slate-900" : "text-slate-500"
            }`}
          >
            Ask
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <TradeAmountHeader />
        <div className="mt-3 flex items-center justify-between gap-4">
          <div className="flex-1">
            <label className="sr-only" htmlFor="trade-amount">
              Amount
            </label>
            <input
              id="trade-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              placeholder="0.00"
              className="w-full bg-transparent text-3xl font-semibold text-slate-900 outline-none placeholder:text-slate-300"
              {...register("amount")}
            />
            <p className="text-sm text-slate-400">
              ≈ ${orderValue != null ? formatUsd(orderValue) : "0.00"}
            </p>
          </div>
          <button
            type="button"
            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"
          >
            SOL
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
          <span>Price</span>
          <span
            className={`rounded-full px-2 py-1 text-[10px] font-bold ${priceStatusClass}`}
          >
            {priceStatus}
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-4">
          <div className="flex-1">
            <label className="sr-only" htmlFor="trade-price">
              Price
            </label>
            <input
              id="trade-price"
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              className="w-full bg-transparent text-3xl font-semibold text-slate-900 outline-none placeholder:text-slate-300"
              {...register("price")}
            />
            <p className="text-sm text-slate-400">
              Live price:{" "}
              {livePrice != null ? `$${formatUsd(livePrice)}` : "--"}
            </p>
          </div>
          <button
            type="button"
            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"
          >
            USDC
          </button>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm">
        {[
          { label: "Type", value: "Limit Order" },
          {
            label: "Order Value",
            value: orderValue != null ? `$${formatUsd(orderValue)}` : "$0.00",
          },
          // { label: "Fee", value: "0.00%" },
          { label: "Route", value: "Protected by Inco" },
        ].map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between text-slate-500"
          >
            <span>{item.label}</span>
            <span className="max-w-[220px] text-right font-semibold text-slate-800">
              {item.value}
            </span>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div
          className={`rounded-2xl border px-4 py-3 text-xs font-semibold ${
            wrapStatus.status === "ready"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : wrapStatus.status === "error"
                ? "border-rose-200 bg-rose-50 text-rose-600"
                : "border-amber-200 bg-amber-50 text-amber-700"
          }`}
          role="status"
        >
          {wrapStatus.status === "ready" ? (
            "SOL wrapped to Inco. Ready to trade."
          ) : wrapStatus.status === "checking" ? (
            "Checking SOL wrap status..."
          ) : wrapStatus.status === "error" ? (
            wrapStatus.message
          ) : (
            <span className="flex flex-wrap items-center gap-2">
              <span>Wrap SOL to Inco before placing orders.</span>
              <Link
                href={`/wrap/${WRAPPED_SOL_MINT}`}
                className="rounded-full border border-amber-300 bg-white px-3 py-1 text-[11px] font-semibold text-amber-700 transition-colors hover:bg-amber-100"
              >
                Wrap SOL
              </Link>
              <button
                type="button"
                onClick={() => setWrapRefreshTick((tick) => tick + 1)}
                className="rounded-full border border-amber-300 bg-white px-3 py-1 text-[11px] font-semibold text-amber-700 transition-colors hover:bg-amber-100"
              >
                Refresh
              </button>
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleInitializeIncoAccounts}
          disabled={!publicKey || ensureIncoAccounts.isPending}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          {ensureIncoAccounts.isPending
            ? "Initializing Inco Accounts..."
            : "Initialize Inco Accounts"}
        </button>
        <button
          type="button"
          onClick={handlePlaceOrder}
          disabled={!canPlaceOrder}
          className={`w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${actionButtonClass}`}
        >
          {placeOrderWithIncoAccounts.isPending
            ? "Placing Order..."
            : actionLabel}
        </button>
        {orderNotice ? (
          <div
            className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
              orderNotice.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-600"
            }`}
            role="status"
          >
            {orderNotice.message}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
        All orders are pre-trade and post-trade private by default.
      </div>
    </section>
  );
};

export default TradePanel;
