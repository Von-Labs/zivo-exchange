"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getWhitelistedTokens } from "@/utils/constants";
import { fetchTokenMetadata } from "@/utils/helius";

interface TokenInfo {
  mint: string;
  name?: string;
  symbol?: string;
  logoUri?: string;
}

// Rate limiting configuration
const RATE_LIMIT_AMOUNT = 500; // Max 500 tokens per hour
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in milliseconds

interface AirdropRecord {
  wallet: string;
  amount: number;
  timestamp: number;
}

const AirdropManager = () => {
  const { publicKey: connectedWallet } = useWallet();

  const [selectedToken, setSelectedToken] = useState("");
  const [airdropAmount, setAirdropAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [airdropRecords, setAirdropRecords] = useState<AirdropRecord[]>([]);
  const [whitelistedTokens, setWhitelistedTokens] = useState<TokenInfo[]>([]);

  // Load airdrop records from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("airdrop_records");
    if (stored) {
      try {
        setAirdropRecords(JSON.parse(stored));
      } catch (err) {
        console.error("Failed to parse airdrop records:", err);
      }
    }
  }, []);

  // Load whitelisted tokens
  useEffect(() => {
    loadWhitelistedTokens();
  }, []);

  // Listen for whitelist updates
  useEffect(() => {
    const handleWhitelistUpdate = () => {
      loadWhitelistedTokens();
    };

    window.addEventListener("whitelist-updated", handleWhitelistUpdate);
    return () => {
      window.removeEventListener("whitelist-updated", handleWhitelistUpdate);
    };
  }, []);

  const loadWhitelistedTokens = async () => {
    const mints = getWhitelistedTokens();

    // Fetch metadata for all tokens
    const tokensWithMetadata = await Promise.all(
      mints.map(async (mint) => {
        const metadata = await fetchTokenMetadata(mint);
        return {
          mint,
          name: metadata?.name,
          symbol: metadata?.symbol,
          logoUri: metadata?.logoURI,
        };
      })
    );

    setWhitelistedTokens(tokensWithMetadata);
  };

  // Save airdrop records to localStorage
  const saveAirdropRecord = (wallet: string, amount: number) => {
    const newRecord: AirdropRecord = {
      wallet,
      amount,
      timestamp: Date.now(),
    };

    const updatedRecords = [...airdropRecords, newRecord];
    setAirdropRecords(updatedRecords);
    localStorage.setItem("airdrop_records", JSON.stringify(updatedRecords));
  };

  // Check rate limit for a wallet
  const checkRateLimit = (walletAddress: string): { allowed: boolean; remaining: number } => {
    const now = Date.now();
    const oneHourAgo = now - RATE_LIMIT_WINDOW;

    // Filter records for this wallet within the last hour
    const recentRecords = airdropRecords.filter(
      (record) =>
        record.wallet === walletAddress &&
        record.timestamp > oneHourAgo
    );

    // Calculate total amount received in the last hour
    const totalReceived = recentRecords.reduce((sum, record) => sum + record.amount, 0);
    const remaining = Math.max(0, RATE_LIMIT_AMOUNT - totalReceived);

    return {
      allowed: totalReceived < RATE_LIMIT_AMOUNT,
      remaining,
    };
  };

  const handleAirdrop = async () => {
    if (!connectedWallet) {
      setError("Please connect your wallet");
      return;
    }

    if (!selectedToken || !airdropAmount) {
      setError("Please select a token and enter amount");
      return;
    }

    if (!whitelistedTokens.some((t) => t.mint === selectedToken)) {
      setError("Selected token is not in the whitelist");
      return;
    }

    const amount = parseFloat(airdropAmount);
    if (isNaN(amount) || amount <= 0) {
      setError("Invalid amount");
      return;
    }

    // Check rate limit
    const { allowed, remaining } = checkRateLimit(connectedWallet.toBase58());
    if (!allowed) {
      setError("You have reached the maximum airdrop limit (500 tokens per hour). Please try again later.");
      return;
    }

    if (amount > remaining) {
      setError(`You can only receive ${remaining} more tokens in this hour. Maximum is 500 tokens per hour.`);
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      // Call API route instead of handling on client
      const response = await fetch("/api/airdrop", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipientAddress: connectedWallet.toBase58(),
          tokenMint: selectedToken,
          amount: amount,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Airdrop failed");
      }

      setSuccess(data.message);
      setAirdropAmount("");

      // Update local rate limit tracking
      saveAirdropRecord(connectedWallet.toBase58(), amount);
    } catch (err: any) {
      console.error("Airdrop error:", err);
      setError(err.message || "Failed to airdrop tokens");
    } finally {
      setLoading(false);
    }
  };

  const walletRateLimit = connectedWallet
    ? checkRateLimit(connectedWallet.toBase58())
    : { allowed: false, remaining: 0 };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Airdrop Tokens</h2>
        <p className="text-gray-600 text-sm">
          Request tokens from the whitelist (Max 500 tokens per hour per wallet)
        </p>
      </div>

      {!connectedWallet && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-yellow-800 text-sm">
            Please connect your wallet to request airdrop
          </p>
        </div>
      )}

      {connectedWallet && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-900">
            <strong>Your wallet:</strong> {connectedWallet.toBase58().slice(0, 8)}...
            {connectedWallet.toBase58().slice(-8)}
          </p>
          <p className="text-sm text-blue-900 mt-1">
            <strong>Remaining this hour:</strong> {walletRateLimit.remaining} tokens
          </p>
        </div>
      )}

      <div className="space-y-4">
        {/* Token Selection */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Select Token <span className="text-red-500">*</span>
          </label>
          <Select
            value={selectedToken}
            onValueChange={setSelectedToken}
            disabled={loading || !connectedWallet}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="-- Select a token --" />
            </SelectTrigger>
            <SelectContent>
              {whitelistedTokens.length === 0 ? (
                <div className="px-2 py-3 text-sm text-gray-500">
                  No tokens in whitelist yet. Add tokens in the Admin panel.
                </div>
              ) : (
                whitelistedTokens.map((token) => (
                  <SelectItem key={token.mint} value={token.mint}>
                    <div className="flex items-center gap-2">
                      {token.logoUri ? (
                        <img
                          src={token.logoUri.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/')}
                          alt={token.symbol}
                          className="w-5 h-5 rounded-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : null}
                      <span className="font-medium">
                        {token.symbol || token.name || "Unknown"}
                      </span>
                      <span className="font-mono text-xs text-gray-500">
                        {token.mint.slice(0, 4)}...{token.mint.slice(-4)}
                      </span>
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {whitelistedTokens.length === 0 && (
            <p className="text-xs text-gray-500 mt-1">
              No tokens in whitelist yet. Add tokens in the Admin panel.
            </p>
          )}
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Amount <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            value={airdropAmount}
            onChange={(e) => setAirdropAmount(e.target.value)}
            placeholder="0"
            min="0"
            max={walletRateLimit.remaining}
            step="any"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={loading || !connectedWallet}
          />
          <p className="text-xs text-gray-500 mt-1">
            Maximum: {walletRateLimit.remaining} tokens (500 per hour limit)
          </p>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {success && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-600 text-sm font-medium">{success}</p>
          </div>
        )}

        {/* Request Airdrop Button */}
        <button
          onClick={handleAirdrop}
          disabled={loading || !connectedWallet || !selectedToken || !airdropAmount || !walletRateLimit.allowed}
          className={`w-full py-3 px-6 rounded-lg font-semibold transition-colors ${
            loading || !connectedWallet || !selectedToken || !airdropAmount || !walletRateLimit.allowed
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {loading ? "Processing Airdrop..." : "Request Airdrop"}
        </button>

        {/* Info */}
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <p className="text-xs text-gray-700">
            <strong>ℹ️ How it works:</strong>
          </p>
          <ul className="text-xs text-gray-600 mt-2 space-y-1 list-disc list-inside">
            <li>Only whitelisted tokens can be airdropped</li>
            <li>Maximum 500 tokens per wallet per hour</li>
            <li>Admin wallet automatically mints tokens to your wallet</li>
            <li>Rate limits reset after 1 hour from your first airdrop</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default AirdropManager;
