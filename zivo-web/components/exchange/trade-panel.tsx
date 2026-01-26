"use client";

import priceFeedsData from "@/data/pyth_lazer_list.json";
import { useMagicblockWebSocket } from "@/utils/hooks";
import { useOrderbookProgram } from "@/utils/orderbook";
import type { PriceFeed } from "@/utils/types";
import debounce from "lodash/debounce";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

type TradeFormValues = {
  amount: string;
  price: string;
};

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
  const actionLabel = isSell ? "Sell SOL" : "Buy SOL";
  const actionButtonClass = isSell
    ? "bg-rose-600 hover:bg-rose-500"
    : "bg-emerald-600 hover:bg-emerald-500";

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
            Buy
          </button>
          <button
            type="button"
            onClick={() => setSide("sell")}
            className={`relative z-10 rounded-full px-4 py-1 transition-colors ${
              side === "sell" ? "text-slate-900" : "text-slate-500"
            }`}
          >
            Sell
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
          <span>Amount</span>
          <span className="text-slate-400">Balance 0.00 SOL</span>
        </div>
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

      <button
        type="button"
        className={`w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors ${actionButtonClass}`}
      >
        {actionLabel}
      </button>

      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
        All orders are pre-trade and post-trade private by default.
      </div>
    </section>
  );
};

export default TradePanel;
