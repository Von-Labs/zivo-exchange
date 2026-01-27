"use client";

import { useEffect, useMemo } from "react";
import {
  useIncoAccountStatus,
  useMatchOrderWithIncoAccounts,
  useOrderbookOrders,
  useOrderbookProgram,
  useOrderbookState,
} from "@/utils/orderbook";
import { useWallet } from "@solana/wallet-adapter-react";

const OrdersPanel = () => {
  const program = useOrderbookProgram();
  const { publicKey } = useWallet();
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
  } = useOrderbookOrders();
  const {
    data: incoStatus,
    status: incoStatusState,
    error: incoStatusError,
  } = useIncoAccountStatus();
  const matchOrderWithIncoAccounts = useMatchOrderWithIncoAccounts();

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
    return orders.map((order) => ({
      address: order.address,
      side: order.side,
      owner: order.owner,
      price: order.price,
      remainingHandle: order.remainingHandle,
      seq: order.seq,
      isOpen: order.isOpen,
    }));
  }, [orders]);

  const isAdmin =
    Boolean(publicKey) && orderbookState?.admin === publicKey?.toBase58();

  const handleMatchOrder = async (row: (typeof rows)[number]) => {
    if (!publicKey) {
      window.alert("Connect your wallet to match orders.");
      return;
    }
    if (row.side !== "Ask") return;
    const amountInput = window.prompt(
      "Enter base amount to match (e.g. 0.5):",
    );
    const amountValue = amountInput?.trim();
    if (!amountValue) return;
    try {
      await matchOrderWithIncoAccounts.mutateAsync({
        orderAddress: row.address,
        owner: row.owner,
        side: "Ask",
        price: row.price,
        amount: amountValue,
      });
      window.alert("Order matched successfully.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to match order.";
      console.error("Failed to match order", err);
      window.alert(message);
    }
  };

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

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
        <div className="grid grid-cols-7 gap-4 bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          <span>Side</span>
          <span>Owner</span>
          <span>Price</span>
          <span>Amount (ENCRYPTED)</span>
          <span>Time (seq)</span>
          <span>Status</span>
          <span>Action</span>
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
            {rows.map((row, index) => (
              <div
                key={`${row.address}-${index}`}
                className="grid grid-cols-7 gap-4 px-4 py-3 text-sm text-slate-700"
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
                  {row.side}
                </span>
                <span className="truncate">{row.owner}</span>
                <span className="font-semibold text-slate-900">
                  {row.price}
                </span>
                <span className="truncate text-slate-500">
                  {row.remainingHandle}
                </span>
                <span className="text-slate-500">{row.seq}</span>
                <span
                  className={row.isOpen ? "text-emerald-600" : "text-slate-400"}
                >
                  {row.isOpen ? "Open" : "Closed"}
                </span>
                <span>
                  {row.side === "Ask" ? (
                    <button
                      type="button"
                      onClick={() => handleMatchOrder(row)}
                      disabled={!isAdmin || matchOrderWithIncoAccounts.isPending}
                      title={
                        !isAdmin
                          ? "Only the orderbook admin can match orders."
                          : undefined
                      }
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        !isAdmin || matchOrderWithIncoAccounts.isPending
                          ? "cursor-not-allowed bg-slate-100 text-slate-400"
                          : "bg-rose-600 text-white hover:bg-rose-500"
                      }`}
                    >
                      Match
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">-</span>
                  )}
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
        </div>
      ) : null}
    </section>
  );
};

export default OrdersPanel;
