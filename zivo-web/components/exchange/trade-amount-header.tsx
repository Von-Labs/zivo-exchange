"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useEffect, useMemo, useState } from "react";

const formatSolBalance = (value: number): string => {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const TradeAmountHeader = () => {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchBalance = async () => {
      if (!publicKey) {
        setSolBalance(null);
        return;
      }

      setIsLoading(true);
      try {
        const lamports = await connection.getBalance(publicKey);
        if (isMounted) {
          setSolBalance(lamports / LAMPORTS_PER_SOL);
        }
      } catch {
        if (isMounted) {
          setSolBalance(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchBalance();

    return () => {
      isMounted = false;
    };
  }, [connection, publicKey]);

  const balanceLabel = useMemo(() => {
    if (!publicKey) return "--";
    if (isLoading) return "Loading...";
    if (solBalance == null) return "--";
    return formatSolBalance(solBalance);
  }, [isLoading, publicKey, solBalance]);

  return (
    <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
      <span>Amount</span>
      <span className="text-slate-400">Balance {balanceLabel} SOL</span>
    </div>
  );
};

export default TradeAmountHeader;
