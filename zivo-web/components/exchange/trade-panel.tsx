"use client";

import { useOrderbookProgram } from "@/utils/orderbook";
import { useState } from "react";
import { useForm } from "react-hook-form";

type TradeFormValues = {
  amount: string;
};

const TradePanel = () => {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const { register, watch } = useForm<TradeFormValues>({
    defaultValues: { amount: "" },
  });
  const amount = watch("amount");
  const program = useOrderbookProgram();
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
              placeholder="0.00"
              className="w-full bg-transparent text-3xl font-semibold text-slate-900 outline-none placeholder:text-slate-300"
              {...register("amount")}
            />
            <p className="text-sm text-slate-400">
              ≈ ${amount && Number(amount) > 0 ? "0.00" : "0.00"}
            </p>
          </div>
          <button
            type="button"
            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"
          >
            SOL
            <span className="text-slate-400">▾</span>
          </button>
        </div>
        <div className="mt-4 flex items-center gap-2">
          {["25%", "50%", "75%", "MAX"].map((value) => (
            <button
              key={value}
              type="button"
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500 hover:text-slate-700"
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm">
        {[
          { label: "Type", value: "Midpoint" },
          { label: "Order Value", value: "$0.00" },
          { label: "Fee", value: "0.00%" },
          { label: "Route", value: "Private" },
        ].map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between text-slate-500"
          >
            <span>{item.label}</span>
            <span className="font-semibold text-slate-800">{item.value}</span>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
        All orders are pre-trade and post-trade private by default.
      </div>
    </section>
  );
};

export default TradePanel;
