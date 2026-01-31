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
import { fetchWrapVaultByIncoMint } from "@/utils/orderbook/build-wrap-transaction";
import type { PriceFeed } from "@/utils/types";
import debounce from "lodash/debounce";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import TradeAmountHeader from "@/components/exchange/trade-amount-header";
import {
  getAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  INCO_USDC_MINT,
  INCO_WSOL_MINT,
  getSplDecimalsForIncoMint,
  SPL_USDC_MINT,
  SPL_WRAPPED_SOL_MINT,
} from "@/utils/mints";

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
  txUrls: { label: string; url: string }[];
};

type BalanceState = {
  base: string | null;
  quote: string | null;
  baseSymbol: string;
  quoteSymbol: string;
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
  const queryClient = useQueryClient();
  const [orderNotice, setOrderNotice] = useState<OrderNotice | null>(null);
  const [toastNotice, setToastNotice] = useState<ToastNotice | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const [balances, setBalances] = useState<BalanceState>({
    base: null,
    quote: null,
    baseSymbol: "SOL",
    quoteSymbol: "USDC",
  });
  const priceFeeds = priceFeedsData as PriceFeed[];
  const solFeed = priceFeeds.find((feed) => feed.name === "SOLUSD");
  const usdcFeed = priceFeeds.find((feed) => feed.name === "USDCUSD");
  const { data: orders, refetch: refetchOrders } = useOrderbookOrders();

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

  const availableBalance = useMemo(() => {
    const raw = side === "buy" ? balances.quote : balances.base;
    const parsed = raw ? Number(raw.replace(/,/g, "")) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  }, [balances.base, balances.quote, side]);

  const requiredBalance = useMemo(() => {
    if (side === "buy") return orderValue;
    const amountValue = Number(amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) return null;
    return amountValue;
  }, [amount, orderValue, side]);

  const hasSufficientBalance =
    requiredBalance == null ||
    availableBalance == null ||
    availableBalance >= requiredBalance;

  const disabledReason = useMemo(() => {
    if (!publicKey) return "Connect your wallet to trade.";
    if (!program) return "Orderbook is unavailable.";
    if (incoStatus?.isInitialized !== true)
      return "Initialize Inco accounts to trade.";
    if (!hasSufficientBalance) {
      const needed = requiredBalance ?? 0;
      const symbol = side === "buy" ? balances.quoteSymbol : balances.baseSymbol;
      return `Insufficient ${symbol} balance. Need ${needed.toFixed(4)} ${symbol}.`;
    }
    if (placeOrderWithIncoAccounts.isPending) return "Placing order...";
    if (placeAndMatchOrderWithIncoAccounts.isPending) return "Placing order...";
    return null;
  }, [
    balances.baseSymbol,
    balances.quoteSymbol,
    hasSufficientBalance,
    incoStatus?.isInitialized,
    placeAndMatchOrderWithIncoAccounts.isPending,
    placeOrderWithIncoAccounts.isPending,
    program,
    publicKey,
    requiredBalance,
    side,
  ]);

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
    !placeAndMatchOrderWithIncoAccounts.isPending &&
    hasSufficientBalance;

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

  const showToast = useCallback(
    (message: string, signatures: { label: string; signature: string }[]) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    const txUrls = signatures.map((item) => ({
      label: item.label,
      url: `https://orbmarkets.io/tx/${item.signature}?cluster=devnet&tab=summary`,
    }));
    setToastNotice({
      message,
      txUrls,
    });
    toastTimerRef.current = window.setTimeout(() => {
      setToastNotice(null);
      toastTimerRef.current = null;
    }, 10000);
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
    const fetchedQuoteDecimals =
      (await fetchIncoMintDecimals(connection, stateAccount.incoQuoteMint)) ??
      null;
    const quoteDecimals =
      fetchedQuoteDecimals && fetchedQuoteDecimals > 0
        ? fetchedQuoteDecimals
        : getSplDecimalsForIncoMint(stateAccount.incoQuoteMint.toBase58()) ?? 9;
    return BigInt(Math.floor(priceValue * Math.pow(10, quoteDecimals)));
  }, [connection, price, program]);

  const headerBalances = useMemo(() => {
    const items = [
      { label: balances.baseSymbol, value: balances.base },
      { label: balances.quoteSymbol, value: balances.quote },
    ];
    const order = ["SOL", "USDC"];
    return items.sort((a, b) => {
      const aIndex = order.indexOf(a.label);
      const bIndex = order.indexOf(b.label);
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }, [
    balances.base,
    balances.baseSymbol,
    balances.quote,
    balances.quoteSymbol,
  ]);

  const formatBalance = useCallback((value: number): string => {
    return value.toLocaleString("en-US", {
      maximumFractionDigits: 4,
    });
  }, []);

  const resolveSplDecimals = useCallback(
    async (mint: PublicKey): Promise<number> => {
      if (mint.toBase58() === SPL_WRAPPED_SOL_MINT) return 9;
      const mintInfo = await connection.getParsedAccountInfo(mint);
      return (
        (mintInfo.value?.data as any)?.parsed?.info?.decimals ??
        9
      );
    },
    [connection],
  );

  const resolveTokenSymbol = useCallback((mint: PublicKey): string => {
    if (mint.toBase58() === SPL_WRAPPED_SOL_MINT) return "SOL";
    if (mint.toBase58() === SPL_USDC_MINT) return "USDC";
    return "TOKEN";
  }, []);

  const resolveSplMintForIncoMint = useCallback((mint: PublicKey) => {
    const mintKey = mint.toBase58();
    if (mintKey === INCO_WSOL_MINT) return SPL_WRAPPED_SOL_MINT;
    if (mintKey === INCO_USDC_MINT) return SPL_USDC_MINT;
    return null;
  }, []);

  const refreshBalances = useCallback(async () => {
    if (!program || !publicKey) return;
    try {
      const baseMint = getDefaultBaseMint();
      const quoteMint = getDefaultQuoteMint();
      const [state] = deriveOrderbookStatePda(baseMint, quoteMint);
      const stateAccount = await fetchOrderbookState(program, state);

      const baseVault = await fetchWrapVaultByIncoMint(
        connection,
        stateAccount.incoBaseMint,
      );
      const quoteVault = await fetchWrapVaultByIncoMint(
        connection,
        stateAccount.incoQuoteMint,
      );

      const baseSplMint =
        baseVault?.splTokenMint.toBase58() ??
        resolveSplMintForIncoMint(stateAccount.incoBaseMint) ??
        SPL_WRAPPED_SOL_MINT;
      const quoteSplMint =
        quoteVault?.splTokenMint.toBase58() ??
        resolveSplMintForIncoMint(stateAccount.incoQuoteMint) ??
        SPL_USDC_MINT;

      const next: BalanceState = {
        base: null,
        quote: null,
        baseSymbol: resolveTokenSymbol(new PublicKey(baseSplMint)),
        quoteSymbol: resolveTokenSymbol(new PublicKey(quoteSplMint)),
      };

      if (baseSplMint === SPL_WRAPPED_SOL_MINT) {
          const solBalance = await connection.getBalance(publicKey);
          next.base = formatBalance(solBalance / LAMPORTS_PER_SOL);
      } else {
        const baseMintKey = new PublicKey(baseSplMint);
        const baseDecimals = await resolveSplDecimals(baseMintKey);
        const baseAta = await getAssociatedTokenAddress(
          baseMintKey,
          publicKey,
        );
        try {
          const baseAccount = await getAccount(connection, baseAta);
          next.base = formatBalance(
            Number(baseAccount.amount) / Math.pow(10, baseDecimals),
          );
        } catch {
          next.base = "0";
        }
      }

      if (quoteSplMint === SPL_WRAPPED_SOL_MINT) {
          const solBalance = await connection.getBalance(publicKey);
          next.quote = formatBalance(solBalance / LAMPORTS_PER_SOL);
      } else {
        const quoteMintKey = new PublicKey(quoteSplMint);
        const quoteDecimals = await resolveSplDecimals(quoteMintKey);
        const quoteAta = await getAssociatedTokenAddress(
          quoteMintKey,
          publicKey,
        );
        try {
          const quoteAccount = await getAccount(connection, quoteAta);
          next.quote = formatBalance(
            Number(quoteAccount.amount) / Math.pow(10, quoteDecimals),
          );
        } catch {
          next.quote = "0";
        }
      }

      setBalances(next);
    } catch {
      setBalances((prev) => ({
        ...prev,
        base: prev.base ?? "0",
        quote: prev.quote ?? "0",
      }));
    }
  }, [
    connection,
    formatBalance,
    program,
    publicKey,
    resolveSplDecimals,
    resolveTokenSymbol,
  ]);

  useEffect(() => {
    refreshBalances();
  }, [refreshBalances]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{
        message: string;
        signatures: { label: string; signature: string }[];
      }>).detail;
      if (!detail) return;
      showToast(detail.message, detail.signatures);
      refreshBalances();
    };
    window.addEventListener("zivo:toast", handler);
    return () => window.removeEventListener("zivo:toast", handler);
  }, [refreshBalances, showToast]);

  const handlePlaceOrder = async () => {
    console.debug("handlePlaceOrder", { side, amount, price });
    setOrderNotice(null);
    try {
      if (!hasSufficientBalance) {
        const needed = requiredBalance ?? 0;
        const symbol =
          side === "buy" ? balances.quoteSymbol : balances.baseSymbol;
        throw new Error(
          `Insufficient ${symbol} balance. Need ${needed.toFixed(4)} ${symbol}.`,
        );
      }
      const priceInQuoteUnits = await resolvePriceInQuoteUnits();
      const makerSide = side === "buy" ? "Ask" : "Bid";
      const findMaker = (candidateOrders?: typeof orders) => {
        return (candidateOrders ?? [])
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
      };

      let maker = findMaker(orders);
      if (!maker) {
        const refreshed = await refetchOrders();
        maker = findMaker(refreshed.data);
      }

      if (maker) {
        const result = await placeAndMatchOrderWithIncoAccounts.mutateAsync({
          makerOrderAddress: maker.address,
          makerOwner: maker.owner,
          makerSide: maker.side,
          price,
          amount,
        });
        const signatures = [
          ...(result.preSignatures ?? []).map((sig, index) => ({
            label: `Wrap ${index + 1}`,
            signature: sig,
          })),
          { label: "Place Order", signature: result.placeSignature },
          { label: "Match Order", signature: result.matchSignature },
          ...(result.postSignatures ?? []).map((sig, index) => ({
            label: `Unwrap ${index + 1}`,
            signature: sig,
          })),
        ];
        showToast("Order placed and filled.", signatures);
      } else {
        const result = await placeOrderWithIncoAccounts.mutateAsync({
          side,
          amount,
          price,
        });
        const signatures = [
          ...(result.preSignatures ?? []).map((sig, index) => ({
            label: `Wrap ${index + 1}`,
            signature: sig,
          })),
          { label: "Place Order", signature: result.signature },
        ];
        showToast("Order placed.", signatures);
      }
      await queryClient.invalidateQueries({ queryKey: ["orderbook", "orders"] });
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
      refreshBalances();
    } catch (err) {
      console.error("handlePlaceOrder failed", err);
      const message = err instanceof Error ? err.message : "Failed to place order.";
      if (message.includes("already been processed") && publicKey) {
        try {
          const latest = await connection.getSignaturesForAddress(publicKey, {
            limit: 1,
          });
          if (latest[0]?.signature) {
            showToast("Order placed successfully.", [
              { label: "Place Order", signature: latest[0].signature },
            ]);
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
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-emerald-700">
            {toastNotice.txUrls.map((tx) => (
              <a
                key={tx.url}
                href={tx.url}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-emerald-300 underline-offset-4"
              >
                {tx.label}
              </a>
            ))}
          </div>
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
        <TradeAmountHeader balances={headerBalances} />
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
        {!canPlaceOrder && disabledReason ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
            {disabledReason}
          </div>
        ) : null}
        {placeOrderWithIncoAccounts.isPending ? (
          <div className="rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-xs font-semibold text-slate-600">
            Step 1: Wrap{" "}
            {side === "buy" ? balances.quoteSymbol : balances.baseSymbol} →
            Inco {side === "buy" ? balances.quoteSymbol : balances.baseSymbol}{" "}
            <span className="text-slate-400">·</span> Step 2: Place Order
          </div>
        ) : null}
        {placeAndMatchOrderWithIncoAccounts.isPending ? (
          <div className="rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-xs font-semibold text-slate-600">
            Step 1: Wrap{" "}
            {side === "buy" ? balances.quoteSymbol : balances.baseSymbol} →
            Inco {side === "buy" ? balances.quoteSymbol : balances.baseSymbol}{" "}
            <span className="text-slate-400">·</span> Step 2: Place Order{" "}
            <span className="text-slate-400">·</span> Step 3: Match Order{" "}
            <span className="text-slate-400">·</span> Step 4: Unwrap
          </div>
        ) : null}
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
