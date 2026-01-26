"use client";

import { useEffect, useMemo } from "react";
import { useOrderbookProgram, useOrderbookState } from "@/utils/orderbook";

const OrdersPanel = () => {
  const program = useOrderbookProgram();
  const { data: orderbookState, status, error, dataUpdatedAt } =
    useOrderbookState();

  useEffect(() => {
    if (error) {
      console.error("Failed to fetch orderbook state", error);
    }
  }, [error]);

  const helperText = useMemo(() => {
    if (!program) return "Connect your wallet to view live activity.";
    if (status === "pending") return "Loading orderbook state...";
    if (status === "error") return "Unable to load orderbook state right now.";
    if (!orderbookState) return "No orderbook state yet.";
    if (dataUpdatedAt) {
      return `Last updated ${new Date(dataUpdatedAt).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })}.`;
    }
    return "Orderbook state is synced.";
  }, [dataUpdatedAt, orderbookState, program, status]);

  const rows = useMemo(() => {
    if (!orderbookState) return [];
    const entries = [
      { label: "Best Bid", slot: orderbookState.bestBid },
      { label: "Best Ask", slot: orderbookState.bestAsk },
    ];
    return entries.map((entry) => ({
      label: entry.label,
      owner: entry.slot.owner || "—",
      clientOrderId: entry.slot.clientOrderId,
      escrowBaseAmount: entry.slot.escrowBaseAmount,
      escrowQuoteAmount: entry.slot.escrowQuoteAmount,
      isActive: entry.slot.isActive,
    }));
  }, [orderbookState]);

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
          {["State", "Orders", "Vaults"].map((filter) => (
            <button
              key={filter}
              className={`rounded-full px-3 py-1 ${
                filter === "State"
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-500"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
        <div className="grid grid-cols-5 gap-4 bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          <span>Slot</span>
          <span>Owner</span>
          <span>Client ID</span>
          <span>Escrow Base</span>
          <span>Escrow Quote</span>
        </div>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-sm text-slate-500">
            <span className="text-base font-semibold text-slate-700">
              No orderbook state
            </span>
            <span className="text-xs text-slate-400">{helperText}</span>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((row, index) => (
              <div
                key={`${row.label}-${index}`}
                className="grid grid-cols-5 gap-4 px-4 py-3 text-sm text-slate-700"
              >
                <span className={row.isActive ? "text-emerald-600" : ""}>
                  {row.label}
                </span>
                <span className="truncate">{row.owner}</span>
                <span>{row.clientOrderId}</span>
                <span className="font-semibold text-slate-900">
                  {row.escrowBaseAmount}
                </span>
                <span className="text-slate-500">{row.escrowQuoteAmount}</span>
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
        </div>
      ) : null}
    </section>
  );
};

export default OrdersPanel;
