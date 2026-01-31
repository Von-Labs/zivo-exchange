"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaSeries,
  ColorType,
  createChart,
  type AreaSeriesPartialOptions,
  type Time,
} from "lightweight-charts";
import { useMarketChart } from "@/utils/hooks";

const timeRanges = [
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
];

const formatNumber = (value: number, options?: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    ...options,
  }).format(value);

const formatCompact = (value: number) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);

const ChartPanel = () => {
  const [selectedDays, setSelectedDays] = useState(timeRanges[1].days);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  const { data, isLoading, isError } = useMarketChart({
    coin: "solana",
    vs: "usd",
    days: selectedDays,
  });

  const seriesData = useMemo(
    () =>
      (data?.prices ?? []).map(([timestamp, price]) => ({
        time: Math.floor(timestamp / 1000) as Time,
        value: price,
      })),
    [data],
  );

  const latestStats = useMemo(() => {
    if (!data || data.prices.length === 0) {
      return {
        open: null,
        last: null,
        change: null,
        volume: null,
      };
    }

    const open = data.prices[0]?.[1] ?? null;
    const last = data.prices[data.prices.length - 1]?.[1] ?? null;
    const volume = data.total_volumes[data.total_volumes.length - 1]?.[1] ?? null;
    const change =
      open !== null && last !== null ? ((last - open) / open) * 100 : null;

    return { open, last, change, volume };
  }, [data]);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container || seriesData.length === 0) {
      return;
    }

    const chart = createChart(container, {
      height: 256,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#64748b",
        fontFamily: "var(--font-sans, ui-sans-serif)",
      },
      grid: {
        vertLines: { color: "rgba(148, 163, 184, 0.2)" },
        horzLines: { color: "rgba(148, 163, 184, 0.2)" },
      },
      rightPriceScale: { borderColor: "rgba(148, 163, 184, 0.4)" },
      timeScale: { borderColor: "rgba(148, 163, 184, 0.4)" },
    });

    const areaSeriesOptions: AreaSeriesPartialOptions = {
      lineColor: "#0f172a",
      lineWidth: 2,
      topColor: "rgba(15, 23, 42, 0.2)",
      bottomColor: "rgba(15, 23, 42, 0)",
    };

    const areaSeries = chart.addSeries(AreaSeries, areaSeriesOptions);
    areaSeries.setData(seriesData);
    chart.timeScale().fitContent();

    const handleResize = () => {
      chart.applyOptions({ width: container.clientWidth });
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [seriesData]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Market
          </p>
          <h2 className="text-lg font-semibold text-slate-900">
            SOL / USDC · {selectedDays === 180 ? "6M" : "3M"} · CoinGecko
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
          {timeRanges.map((range) => (
            <button
              key={range.label}
              type="button"
              onClick={() => setSelectedDays(range.days)}
              className={`rounded-full px-3 py-1 ${
                selectedDays === range.days
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-500"
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)] p-6">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
          <span>{isError ? "Chart unavailable" : "Price chart"}</span>
          <span>
            {isLoading ? "Loading data" : "Cached feed · 30m refresh"}
          </span>
        </div>
        <div className="mt-6 h-64 rounded-xl" ref={chartContainerRef}>
          {isLoading && (
            <div className="flex h-full items-center justify-center rounded-xl bg-[linear-gradient(90deg,rgba(148,163,184,0.15)_1px,transparent_1px),linear-gradient(180deg,rgba(148,163,184,0.12)_1px,transparent_1px)] bg-[size:32px_32px] text-xs font-semibold text-slate-400">
              Loading chart...
            </div>
          )}
          {isError && (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 text-xs font-semibold text-slate-400">
              Data unavailable. Try again soon.
            </div>
          )}
        </div>
        {/* <div className="mt-6 grid gap-3 text-xs text-slate-500 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
              Open
            </p>
            <p className="mt-1 text-base font-semibold text-slate-900">
              {latestStats.open !== null
                ? formatNumber(latestStats.open)
                : "--"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
              Volume
            </p>
            <p className="mt-1 text-base font-semibold text-slate-900">
              {latestStats.volume !== null
                ? formatCompact(latestStats.volume)
                : "--"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
              Change
            </p>
            <p
              className={`mt-1 text-base font-semibold ${
                latestStats.change !== null && latestStats.change < 0
                  ? "text-rose-600"
                  : latestStats.change !== null
                    ? "text-emerald-600"
                    : "text-slate-500"
              }`}
            >
              {latestStats.change !== null
                ? `${latestStats.change > 0 ? "+" : ""}${formatNumber(
                    latestStats.change,
                    { maximumFractionDigits: 2 },
                  )}%`
                : "--"}
            </p>
          </div>
        </div> */}
      </div>
    </section>
  );
};

export default ChartPanel;
