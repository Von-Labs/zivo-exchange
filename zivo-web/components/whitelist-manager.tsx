"use client";

import { useState, useEffect } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { fetchTokenMetadata } from "@/utils/helius";

interface TokenInfo {
  mint: string;
  name?: string;
  symbol?: string;
  logoUri?: string;
}

const WhitelistManager = () => {
  const { connection } = useConnection();
  const [whitelistedTokens, setWhitelistedTokens] = useState<TokenInfo[]>([]);
  const [newTokenMint, setNewTokenMint] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Load whitelist from localStorage
  useEffect(() => {
    loadWhitelist();
  }, []);

  const loadWhitelist = async () => {
    const stored = localStorage.getItem("spl_token_whitelist");
    if (stored) {
      try {
        const mints = JSON.parse(stored) as string[];
        // Fetch metadata for all tokens
        const tokensWithMetadata = await Promise.all(
          mints.map(async (mint) => {
            // Special handling for wrapped SOL
            if (mint === "So11111111111111111111111111111111111111112") {
              return {
                mint,
                name: "Wrapped SOL",
                symbol: "SOL",
                logoUri: "https://statics.solscan.io/solscan-img/solana_icon.svg",
              };
            }

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
      } catch (err) {
        console.error("Failed to load whitelist:", err);
      }
    }
  };

  const saveWhitelist = (tokens: string[]) => {
    localStorage.setItem("spl_token_whitelist", JSON.stringify(tokens));
    // Dispatch event to notify other components
    window.dispatchEvent(new Event("whitelist-updated"));
  };

  const handleAddToken = async () => {
    setError("");
    setSuccess("");

    if (!newTokenMint.trim()) {
      setError("Please enter a token mint address");
      return;
    }

    // Validate it's a valid public key
    try {
      new PublicKey(newTokenMint.trim());
    } catch (err) {
      setError("Invalid Solana address");
      return;
    }

    // Check if already in whitelist
    if (whitelistedTokens.some((t) => t.mint === newTokenMint.trim())) {
      setError("Token is already in the whitelist");
      return;
    }

    setLoading(true);

    try {
      // Fetch token metadata
      const metadata = await fetchTokenMetadata(newTokenMint.trim());

      // Add to whitelist
      const newToken: TokenInfo = {
        mint: newTokenMint.trim(),
        name: metadata?.name,
        symbol: metadata?.symbol,
        logoUri: metadata?.logoURI,
      };

      const updatedTokens = [...whitelistedTokens, newToken];
      setWhitelistedTokens(updatedTokens);
      saveWhitelist(updatedTokens.map((t) => t.mint));

      setSuccess(`Successfully added ${newToken.symbol || "token"} to whitelist`);
      setNewTokenMint("");
    } catch (err: any) {
      console.error("Error adding token:", err);
      setError(err.message || "Failed to add token");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveToken = (mintToRemove: string) => {
    const updatedTokens = whitelistedTokens.filter((t) => t.mint !== mintToRemove);
    setWhitelistedTokens(updatedTokens);
    saveWhitelist(updatedTokens.map((t) => t.mint));
    setSuccess("Token removed from whitelist");
    setTimeout(() => setSuccess(""), 3000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">SPL Token Whitelist</h2>
        <p className="text-gray-600 text-sm">
          Manage which SPL tokens can be used for vault creation and wrapping
        </p>
      </div>

      {/* Add Token Section */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            Add Token to Whitelist <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newTokenMint}
              onChange={(e) => setNewTokenMint(e.target.value)}
              placeholder="Enter SPL token mint address"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
            <button
              onClick={handleAddToken}
              disabled={loading || !newTokenMint.trim()}
              className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
                loading || !newTokenMint.trim()
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {loading ? "Adding..." : "Add Token"}
            </button>
          </div>
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
      </div>

      {/* Whitelisted Tokens List */}
      <div>
        <h3 className="text-lg font-semibold mb-4">
          Whitelisted Tokens ({whitelistedTokens.length})
        </h3>

        {whitelistedTokens.length === 0 ? (
          <div className="p-8 text-center border-2 border-dashed border-gray-300 rounded-lg">
            <p className="text-gray-500">No tokens in whitelist yet</p>
            <p className="text-sm text-gray-400 mt-1">
              Add SPL tokens to allow them to be used in vaults
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {whitelistedTokens.map((token) => (
              <div
                key={token.mint}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {/* Token Logo */}
                  {token.logoUri ? (
                    <img
                      src={token.logoUri.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/')}
                      alt={token.symbol}
                      className="w-10 h-10 rounded-full object-cover border-2 border-gray-200 flex-shrink-0"
                      onError={(e) => {
                        e.currentTarget.outerHTML = `<div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">${token.symbol?.[0] || 'T'}</div>`;
                      }}
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {token.symbol?.[0] || 'T'}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-gray-900">
                        {token.name || "Unknown Token"}
                      </h4>
                      {token.symbol && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded">
                          {token.symbol}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-mono text-gray-500 truncate">
                      {token.mint}
                    </p>
                  </div>
                </div>

                {/* Remove Button */}
                <button
                  onClick={() => handleRemoveToken(token.mint)}
                  className="ml-4 px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
        <p className="text-xs text-gray-700">
          <strong>ℹ️ Note:</strong>
        </p>
        <ul className="text-xs text-gray-600 mt-2 space-y-1 list-disc list-inside">
          <li>Only whitelisted tokens can be used to create vaults</li>
          <li>Only whitelisted tokens will appear in the wrap/unwrap interface</li>
          <li>Changes take effect immediately</li>
          <li>Whitelist is stored in browser localStorage</li>
        </ul>
      </div>
    </div>
  );
};

export default WhitelistManager;
