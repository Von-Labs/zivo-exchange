"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

interface Commitment {
  address: string;
  amount: string;
  vault: string;
  timestamp: number;
  txSignature: string;
  spent?: boolean;
}

const CommitmentHistory = () => {
  const { publicKey } = useWallet();
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [filter, setFilter] = useState<"all" | "active" | "spent">("all");

  useEffect(() => {
    loadCommitments();

    // Listen for storage changes
    const handleStorage = () => loadCommitments();
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [publicKey]);

  const loadCommitments = () => {
    const stored = localStorage.getItem("shielded_commitments");
    if (stored) {
      const all = JSON.parse(stored) as Commitment[];
      // Sort by timestamp, newest first
      all.sort((a, b) => b.timestamp - a.timestamp);
      setCommitments(all);
    }
  };

  const markAsSpent = (address: string) => {
    const updated = commitments.map((c) =>
      c.address === address ? { ...c, spent: true } : c
    );
    setCommitments(updated);
    localStorage.setItem("shielded_commitments", JSON.stringify(updated));
  };

  const deleteCommitment = (address: string) => {
    if (!confirm("Are you sure you want to delete this commitment?")) return;

    const updated = commitments.filter((c) => c.address !== address);
    setCommitments(updated);
    localStorage.setItem("shielded_commitments", JSON.stringify(updated));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  const filteredCommitments = commitments.filter((c) => {
    if (filter === "all") return true;
    if (filter === "active") return !c.spent;
    if (filter === "spent") return c.spent;
    return true;
  });

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  if (!publicKey) {
    return (
      <div className="text-center text-gray-500 py-8">
        Please connect your wallet to view commitment history
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Commitment History</h2>
          <p className="text-gray-600 text-sm">
            Your shielded commitments for private transactions
          </p>
        </div>

        {/* Filter */}
        <div className="flex gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === "all"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            All ({commitments.length})
          </button>
          <button
            onClick={() => setFilter("active")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === "active"
                ? "bg-green-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Active ({commitments.filter((c) => !c.spent).length})
          </button>
          <button
            onClick={() => setFilter("spent")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === "spent"
                ? "bg-gray-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Spent ({commitments.filter((c) => c.spent).length})
          </button>
        </div>
      </div>

      {/* Commitments List */}
      {filteredCommitments.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
          <div className="text-4xl mb-4">🛡️</div>
          <p className="text-gray-500">
            {filter === "all"
              ? "No commitments yet"
              : filter === "active"
              ? "No active commitments"
              : "No spent commitments"}
          </p>
          <p className="text-sm text-gray-400 mt-2">
            Wrap & Shield tokens to create your first commitment
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCommitments.map((commitment) => (
            <div
              key={commitment.address}
              className={`p-4 border rounded-lg transition-all ${
                commitment.spent
                  ? "bg-gray-50 border-gray-300 opacity-60"
                  : "bg-white border-gray-200 hover:border-blue-400 hover:shadow-md"
              }`}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">
                    {commitment.spent ? "🔓" : "🛡️"}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-lg">
                        {commitment.amount} Tokens
                      </span>
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded ${
                          commitment.spent
                            ? "bg-gray-200 text-gray-600"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {commitment.spent ? "Spent" : "Active"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {formatDate(commitment.timestamp)}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  {!commitment.spent && (
                    <button
                      onClick={() => markAsSpent(commitment.address)}
                      className="px-3 py-1 text-sm text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded"
                      title="Mark as spent"
                    >
                      Mark Spent
                    </button>
                  )}
                  <button
                    onClick={() => deleteCommitment(commitment.address)}
                    className="px-3 py-1 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
                    title="Delete"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Commitment Address */}
              <div className="mb-2">
                <label className="text-xs text-gray-500 mb-1 block">
                  Commitment Address:
                </label>
                <div className="flex items-center gap-2 p-2 bg-gray-50 border border-gray-200 rounded">
                  <code className="flex-1 text-xs font-mono truncate">
                    {commitment.address}
                  </code>
                  <button
                    onClick={() => copyToClipboard(commitment.address)}
                    className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Copy
                  </button>
                </div>
              </div>

              {/* Transaction Link */}
              <div className="flex items-center gap-4 text-xs">
                <span className="text-gray-500">Vault:</span>
                <code className="font-mono text-gray-700">
                  {formatAddress(commitment.vault)}
                </code>
                <a
                  href={`https://explorer.solana.com/tx/${commitment.txSignature}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  View Transaction ↗
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info Box */}
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <h4 className="font-semibold text-yellow-900 mb-2">
          ⚠️ Important Notes:
        </h4>
        <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
          <li>Commitments are stored locally in your browser</li>
          <li>Back up your commitments to access funds from other devices</li>
          <li>Mark commitments as spent after using them to avoid confusion</li>
          <li>You need the commitment address to perform shielded transfers or unwraps</li>
        </ul>
      </div>
    </div>
  );
};

export default CommitmentHistory;
