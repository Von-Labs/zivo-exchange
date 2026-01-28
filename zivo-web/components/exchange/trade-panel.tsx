"use client";

import priceFeedsData from "@/data/pyth_lazer_list.json";
import { useMagicblockWebSocket } from "@/utils/hooks";
import {
  useEnsureIncoAccounts,
  useIncoAccountStatus,
  useOrderbookOrders,
  useOrderbookProgram,
  usePlaceAndMatchOrderWithIncoAccounts,
  usePlaceOrderWithIncoAccounts,
} from "@/utils/orderbook";
import {
  deriveOrderbookStatePda,
  fetchOrderbookState,
  getDefaultBaseMint,
  getDefaultQuoteMint,
} from "@/utils/orderbook/methods";
import { fetchIncoMintDecimals } from "@/utils/orderbook/hooks/inco-accounts";
import type { PriceFeed } from "@/utils/types";
import debounce from "lodash/debounce";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import TradeAmountHeader from "@/components/exchange/trade-amount-header";

type TradeFormValues = {
  amount: string;
  price: string;
};

type OrderNotice = {
  type: "success" | "error";
  message: string;
};

type ToastNotice = {
  message: string;
  txUrl: string;
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
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const ensureIncoAccounts = useEnsureIncoAccounts();
  const { data: incoStatus } = useIncoAccountStatus();
  const placeOrderWithIncoAccounts = usePlaceOrderWithIncoAccounts();
  const placeAndMatchOrderWithIncoAccounts =
    usePlaceAndMatchOrderWithIncoAccounts();
  const [orderNotice, setOrderNotice] = useState<OrderNotice | null>(null);
  const [toastNotice, setToastNotice] = useState<ToastNotice | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const priceFeeds = priceFeedsData as PriceFeed[];
  const solFeed = priceFeeds.find((feed) => feed.name === "SOLUSD");
  const usdcFeed = priceFeeds.find((feed) => feed.name === "USDCUSD");
  const { data: orders } = useOrderbookOrders();

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
  const canPlaceOrder =
    !!program &&
    !!publicKey &&
    incoStatus?.isInitialized === true &&
    !placeOrderWithIncoAccounts.isPending &&
    !placeAndMatchOrderWithIncoAccounts.isPending;

  const handleInitializeIncoAccounts = async () => {
    setOrderNotice(null);
    try {
      await ensureIncoAccounts.mutateAsync();
    } catch (err) {
      setOrderNotice({
        type: "error",
        message:
          err instanceof Error ? err.message : "Failed to initialize accounts.",
      });
    }
  };

  const showToast = useCallback((message: string, signature: string) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToastNotice({
      message,
      txUrl: `https://orbmarkets.io/tx/${signature}?cluster=devnet&tab=summary`,
    });
    toastTimerRef.current = window.setTimeout(() => {
      setToastNotice(null);
      toastTimerRef.current = null;
    }, 5000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const resolvePriceInQuoteUnits = useCallback(async (): Promise<bigint> => {
    if (!program) throw new Error("Orderbook program not available");
    const priceValue = Number(price);
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      throw new Error("Price must be a positive number");
    }
    const baseMint = getDefaultBaseMint();
    const quoteMint = getDefaultQuoteMint();
    const [state] = deriveOrderbookStatePda(baseMint, quoteMint);
    const stateAccount = await fetchOrderbookState(program, state);
    const quoteDecimals =
      (await fetchIncoMintDecimals(connection, stateAccount.incoQuoteMint)) ??
      9;
    return BigInt(Math.floor(priceValue * Math.pow(10, quoteDecimals)));
  }, [connection, price, program]);

  const handlePlaceOrder = async () => {
    setOrderNotice(null);
    try {
      const priceInQuoteUnits = await resolvePriceInQuoteUnits();
      const makerSide = side === "buy" ? "Ask" : "Bid";
      const maker = (orders ?? [])
        .filter(
          (order) =>
            order.side === makerSide &&
            order.price === priceInQuoteUnits.toString(),
        )
        .sort((a, b) => {
          const aSeq = BigInt(a.seq);
          const bSeq = BigInt(b.seq);
          if (aSeq === bSeq) return 0;
          return aSeq < bSeq ? -1 : 1;
        })[0];

      if (maker) {
        const result = await placeAndMatchOrderWithIncoAccounts.mutateAsync({
          makerOrderAddress: maker.address,
          makerOwner: maker.owner,
          makerSide: maker.side,
          price: maker.price,
          amount,
        });
        showToast("Order placed and filled.", result.matchSignature);
      } else {
        const result = await placeOrderWithIncoAccounts.mutateAsync({
          side,
          amount,
          price,
        });
        showToast("Order placed.", result.signature);
      }
      setValue("amount", "", {
        shouldDirty: true,
        shouldTouch: true,
      });
      setOrderNotice({
        type: "success",
        message: maker
          ? "Order placed and matched successfully."
          : "Order placed successfully.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to place order.";
      if (message.includes("already been processed") && publicKey) {
        try {
          const latest = await connection.getSignaturesForAddress(publicKey, {
            limit: 1,
          });
          if (latest[0]?.signature) {
            showToast("Order placed successfully.", latest[0].signature);
            setOrderNotice({
              type: "success",
              message: "Order placed successfully.",
            });
            return;
          }
        } catch {
          // Fall through to error notice.
        }
      }
      setOrderNotice({
        type: "error",
        message,
      });
    }
  };

  return (
    <section className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
      {toastNotice ? (
        <div className="fixed right-6 top-6 z-50 max-w-xs rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-700 shadow-lg">
          <p>{toastNotice.message}</p>
          <a
            href={toastNotice.txUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex text-xs font-semibold text-emerald-700 underline decoration-emerald-300 underline-offset-4"
          >
            View on OrbMarkets
          </a>
        </div>
      ) : null}
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
