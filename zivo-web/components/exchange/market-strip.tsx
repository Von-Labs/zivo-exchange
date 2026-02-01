"use client";

import { useMemo } from "react";
import priceFeedsData from "@/data/pyth_lazer_list.json";
import { useMagicblockWebSocket } from "@/utils/hooks";
import type { PriceFeed } from "@/utils/types";

const formatPrice = (value: number): string => {
  const isUnderTwo = value <= 100;
  const decimals = isUnderTwo ? 10 : 3;

  let formatted = value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  formatted = formatted.replace(/^0+(?=\d)/, "0");
  return formatted;
};

const normalizeFeedPrice = (
  raw: number | null,
  feed?: PriceFeed,
): number | null => {
  if (raw == null || !feed) return null;
  return raw / Math.pow(10, Math.abs(feed.exponent));
};

const MarketStrip = () => {
  const priceFeeds = priceFeedsData as PriceFeed[];
  const solFeed = priceFeeds.find((feed) => feed.name === "SOLUSD");
  const btcFeed = priceFeeds.find((feed) => feed.name === "BTCUSD");
  const usdcFeed = priceFeeds.find((feed) => feed.name === "USDCUSD");

  const {
    price: solRaw,
    isConnected: solConnected,
    isConnecting: solConnecting,
  } = useMagicblockWebSocket(solFeed);
  const {
    price: btcRaw,
    isConnected: btcConnected,
    isConnecting: btcConnecting,
  } = useMagicblockWebSocket(btcFeed);
  const {
    price: usdcRaw,
    isConnected: usdcConnected,
    isConnecting: usdcConnecting,
  } = useMagicblockWebSocket(usdcFeed);

  const solUsd = normalizeFeedPrice(solRaw, solFeed);
  const btcUsd = normalizeFeedPrice(btcRaw, btcFeed);
  const usdcUsd = normalizeFeedPrice(usdcRaw, usdcFeed);

  const marketData = useMemo(() => {
    const solUsdc =
      solUsd != null && usdcUsd != null ? solUsd / usdcUsd : null;
    const btcUsdc =
      btcUsd != null && usdcUsd != null ? btcUsd / usdcUsd : null;

    return [
      {
        name: "SOL/USDC",
        price: solUsdc,
        isConnected: solConnected,
        isConnecting: solConnecting,
      },
      {
        name: "BTC/USDC",
        price: btcUsdc,
        isConnected: btcConnected,
        isConnecting: btcConnecting,
      },
    ];
  }, [
    solUsd,
    btcUsd,
    usdcUsd,
    solConnected,
    solConnecting,
    btcConnected,
    btcConnecting,
  ]);

  const usdcStatus = usdcConnected && usdcUsd != null;
  const usdcStatusLabel = usdcStatus
    ? "LIVE"
    : usdcConnecting
      ? "SYNC"
      : "OFFLINE";
  const usdcStatusClass = usdcStatus
    ? "bg-emerald-100 text-emerald-700"
    : usdcConnecting
      ? "bg-amber-100 text-amber-700"
      : "bg-rose-100 text-rose-700";

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 text-slate-900">
          <img
            src="/magicblock-black.png"
            alt="MagicBlock"
            className="h-6 w-auto"
          />
          Powered by MagicBlock real time oracle
        </span>
        {/* <span className="h-1 w-1 rounded-full bg-slate-300" />
        <span className="text-[10px] font-medium uppercase text-slate-400">
          USDC reference
        </span>
        <span
          className={`rounded-full px-2 py-1 text-[10px] font-bold ${usdcStatusClass}`}
        >
          {usdcStatusLabel}
        </span> */}
      </div>
      <div className="flex flex-wrap items-center gap-6 text-[11px] tracking-[0.18em]">
        {marketData.map((market) => {
          const isLive = market.isConnected && market.price != null;
          const statusLabel = isLive
            ? "LIVE"
            : market.isConnecting
              ? "SYNC"
              : "OFFLINE";
          const statusClass = isLive
            ? "bg-emerald-100 text-emerald-700"
            : market.isConnecting
              ? "bg-amber-100 text-amber-700"
              : "bg-rose-100 text-rose-700";

          return (
            <div key={market.name} className="flex items-center gap-2 text-slate-600">
              <span className="font-semibold text-slate-800">{market.name}</span>
              <span className="text-slate-400">
                {market.price != null ? `$${formatPrice(market.price)}` : "--"}
              </span>
              <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${statusClass}`}>
                {statusLabel}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MarketStrip;
