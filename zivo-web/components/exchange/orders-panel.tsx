"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useIncoAccountStatus,
  useOrderbookOrders,
  useOrderbookProgram,
  useOrderbookState,
  type OrderView,
} from "@/utils/orderbook";
import {
  deriveOrderbookStatePda,
  getDefaultBaseMint,
  getDefaultQuoteMint,
} from "@/utils/orderbook/methods";
import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { decrypt } from "@inco/solana-sdk/attested-decrypt";
import { getSplDecimalsForIncoMint } from "@/utils/mints";
import { buildUnwrapTransaction } from "@/utils/orderbook/build-wrap-transaction";
import {
  extractHandle,
  INCO_ACCOUNT_DISCRIMINATOR,
  INCO_TOKEN_PROGRAM_ID,
} from "@/utils/constants";

const OrdersPanel = () => {
  const program = useOrderbookProgram();
  const { connection } = useConnection();
  const { publicKey, sendTransaction, signMessage } = useWallet();
  const anchorWallet = useAnchorWallet();
  const [claimNotice, setClaimNotice] = useState<string | null>(null);
  const [claimPending, setClaimPending] = useState(false);
  const [claimDecrypting, setClaimDecrypting] = useState(false);
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
    return orders.map((order: OrderView) => ({
      address: order.address,
      side: order.side,
      owner: order.owner,
      price: order.price,
      remainingHandle: order.remainingHandle,
      seq: order.seq,
      isOpen: order.isOpen,
      isFilled: order.isFilled,
    }));
  }, [orders]);

  const formatUnits = (value: bigint, decimals: number) => {
    if (decimals <= 0) return value.toString();
    const raw = value.toString();
    const padded = raw.padStart(decimals + 1, "0");
    const whole = padded.slice(0, -decimals);
    const fraction = padded.slice(-decimals).replace(/0+$/g, "");
    return fraction ? `${whole}.${fraction}` : whole;
  };

  const decryptIncoBalanceForMint = async (incoMint: PublicKey) => {
    if (!publicKey || !signMessage) return null;

    const accounts = await connection.getProgramAccounts(INCO_TOKEN_PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: bs58.encode(Buffer.from(INCO_ACCOUNT_DISCRIMINATOR)),
          },
        },
        { memcmp: { offset: 8, bytes: incoMint.toBase58() } },
        { memcmp: { offset: 40, bytes: publicKey.toBase58() } },
      ],
    });

    if (accounts.length === 0) return null;

    const handle = extractHandle(accounts[0].account.data as Buffer);
    const result = await decrypt([handle.toString()], {
      address: publicKey,
      signMessage,
    });

    if (!result.plaintexts || result.plaintexts.length === 0) return null;

    const decrypted = BigInt(result.plaintexts[0]);
    const decimals = getSplDecimalsForIncoMint(incoMint.toBase58()) ?? 9;
    return formatUnits(decrypted, decimals);
  };

  const handleClaim = async (side: OrderView["side"]) => {
    if (!publicKey || !anchorWallet) {
      setClaimNotice("Connect your wallet to claim.");
      return;
    }
    if (!orderbookState) {
      setClaimNotice("Orderbook state not available.");
      return;
    }

    const incoMint =
      side === "Bid"
        ? orderbookState.incoBaseMint
        : side === "Ask"
          ? orderbookState.incoQuoteMint
          : null;
    if (!incoMint) {
      setClaimNotice("Unsupported order side for claim.");
      return;
    }

    let suggestedAmount = "";
    if (signMessage) {
      setClaimDecrypting(true);
      try {
        const decrypted = await decryptIncoBalanceForMint(
          new PublicKey(incoMint),
        );
        if (decrypted) {
          suggestedAmount = decrypted;
        }
      } catch (err) {
        console.warn("Failed to decrypt claim balance", err);
        setClaimNotice("Unable to decrypt balance, enter amount manually.");
      } finally {
        setClaimDecrypting(false);
      }
    }

    const amountInput = window.prompt(
      "Enter amount to unwrap (SPL units):",
      suggestedAmount,
    );
    if (!amountInput) return;

    const amountValue = Number(amountInput);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setClaimNotice("Please enter a valid amount.");
      return;
    }

    const decimals = getSplDecimalsForIncoMint(incoMint);
    if (decimals == null) {
      setClaimNotice("Unsupported mint for unwrap.");
      return;
    }

    const amountLamports = BigInt(
      Math.floor(amountValue * Math.pow(10, decimals)),
    );

    setClaimPending(true);
    setClaimNotice(null);
    try {
      const tx = await buildUnwrapTransaction({
        connection,
        wallet: anchorWallet,
        owner: publicKey,
        incoMint: new PublicKey(incoMint),
        amountLamports,
        feePayer: publicKey,
      });

      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction(signature, "confirmed");
      setClaimNotice("Unwrap submitted successfully.");
    } catch (err) {
      setClaimNotice(
        err instanceof Error ? err.message : "Failed to unwrap tokens.",
      );
    } finally {
      setClaimPending(false);
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
      {claimNotice ? (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-600">
          {claimNotice}
        </div>
      ) : null}
      {claimDecrypting ? (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
          Decrypting claimable balance...
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
                <span className="flex flex-col items-start gap-2">
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
                  {(row.isFilled || !row.isOpen) &&
                  publicKey &&
                  row.owner === publicKey.toBase58() ? (
                    <button
                      type="button"
                      onClick={() => handleClaim(row.side)}
                      disabled={claimPending}
                      className="rounded-full border border-amber-300 bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900 shadow-sm transition hover:border-amber-400 hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {claimPending ? "Claiming..." : "Claim / Unwrap"}
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
