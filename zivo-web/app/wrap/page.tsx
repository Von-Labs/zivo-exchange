"use client";

import { useState, useEffect } from "react";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { useRouter } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import Header from "@/components/header";
import Padder from "@/components/padder";
import ExchangeShell from "@/components/exchange/exchange-shell";
import { ZIVO_WRAP_PROGRAM_ID, isTokenWhitelisted } from "@/utils/constants";
import { fetchTokenMetadata } from "@/utils/helius";
import bs58 from "bs58";

interface VaultData {
  address: string;
  authority: string;
  splTokenMint: string;
  incoTokenMint: string;
  vaultTokenAccount: string;
  isInitialized: boolean;
  tokenName?: string;
  tokenSymbol?: string;
  tokenLogoUri?: string;
}

const WrapPage = () => {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const router = useRouter();

  const [availableVaults, setAvailableVaults] = useState<VaultData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const VAULT_DISCRIMINATOR = [211, 8, 232, 43, 2, 152, 117, 119];

  // Automatically fetch all whitelisted vaults on mount
  useEffect(() => {
    if (anchorWallet) {
      fetchWhitelistedVaults();
    }
  }, [anchorWallet]);

  // Listen for whitelist updates
  useEffect(() => {
    const handleWhitelistUpdate = () => {
      if (anchorWallet) {
        fetchWhitelistedVaults();
      }
    };

    window.addEventListener("whitelist-updated", handleWhitelistUpdate);
    return () => {
      window.removeEventListener("whitelist-updated", handleWhitelistUpdate);
    };
  }, [anchorWallet]);

  const fetchWhitelistedVaults = async () => {
    setLoading(true);
    setError("");

    try {
      console.log(
        "Fetching vaults for program:",
        ZIVO_WRAP_PROGRAM_ID.toBase58(),
      );

      // Fetch all vault accounts
      const accounts = await connection.getProgramAccounts(
        ZIVO_WRAP_PROGRAM_ID,
        {
          filters: [
            {
              memcmp: {
                offset: 0,
                bytes: bs58.encode(Buffer.from(VAULT_DISCRIMINATOR)),
              },
            },
          ],
        },
      );

      console.log(`Found ${accounts.length} vault accounts`);

      const vaultList: VaultData[] = [];

      // Parse all whitelisted vaults
      for (const { pubkey, account } of accounts) {
        try {
          // Parse vault data manually (discriminator 8 bytes, then fields)
          const data = account.data;
          let offset = 8; // Skip discriminator

          // Read authority (32 bytes)
          const authorityBytes = data.slice(offset, offset + 32);
          const authority = new PublicKey(authorityBytes);
          offset += 32;

          // Read spl_token_mint (32 bytes)
          const splMintBytes = data.slice(offset, offset + 32);
          const splTokenMint = new PublicKey(splMintBytes);
          offset += 32;

          // Read inco_token_mint (32 bytes)
          const incoMintBytes = data.slice(offset, offset + 32);
          const incoTokenMint = new PublicKey(incoMintBytes);
          offset += 32;

          // Read vault_token_account (32 bytes)
          const vaultAccountBytes = data.slice(offset, offset + 32);
          const vaultTokenAccount = new PublicKey(vaultAccountBytes);
          offset += 32;

          // Read is_initialized (1 byte)
          const isInitialized = data[offset] === 1;

          const splMintStr = splTokenMint.toBase58();

          console.log("Found vault with SPL mint:", splMintStr);

          // Only add whitelisted vaults
          if (isTokenWhitelisted(splMintStr)) {
            console.log("SPL token is whitelisted, adding vault");
            vaultList.push({
              address: pubkey.toBase58(),
              authority: authority.toBase58(),
              splTokenMint: splMintStr,
              incoTokenMint: incoTokenMint.toBase58(),
              vaultTokenAccount: vaultTokenAccount.toBase58(),
              isInitialized,
            });
          }
        } catch (err) {
          console.error("Error parsing vault:", err);
        }
      }

      if (vaultList.length === 0) {
        setError(
          "No whitelisted vaults found. Please create a vault in the admin panel.",
        );
      } else {
        // Fetch metadata for all vaults
        const vaultsWithMetadata = await Promise.all(
          vaultList.map(async (vault) => {
            // Special handling for wrapped SOL
            if (vault.splTokenMint === "So11111111111111111111111111111111111111112") {
              return {
                ...vault,
                tokenName: "Wrapped SOL",
                tokenSymbol: "SOL",
                tokenLogoUri: "https://statics.solscan.io/solscan-img/solana_icon.svg",
              };
            }

            const metadata = await fetchTokenMetadata(vault.splTokenMint);
            return {
              ...vault,
              tokenName: metadata?.name || "Unknown Token",
              tokenSymbol: metadata?.symbol || "TOKEN",
              tokenLogoUri: metadata?.logoURI,
            };
          }),
        );
        setAvailableVaults(vaultsWithMetadata);
        console.log(`Found ${vaultsWithMetadata.length} whitelisted vault(s)`);
      }

      setLoading(false);
    } catch (err: any) {
      console.error("Error fetching vaults:", err);
      setError(err.message || "Failed to fetch vaults");
      setLoading(false);
    }
  };

  const handleVaultClick = (vault: VaultData) => {
    // Navigate to /wrap/[splTokenAddress]
    router.push(`/wrap/${vault.splTokenMint}`);
  };

  return (
    <Padder>
      <Header />
      <div className="font-sans text-slate-900">
        <ExchangeShell>
          <div className="mx-auto max-w-7xl space-y-6">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Tokens
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900">
                Wrap & Unwrap Tokens
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Select a token to wrap SPL tokens to encrypted Inco tokens and
                back
              </p>
            </div>

            {/* Loading State */}
            {loading && (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="text-gray-600 mt-2">Loading vaults...</p>
              </div>
            )}

            {/* Error State */}
            {error && !loading && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-600 text-sm">{error}</p>
                <button
                  onClick={fetchWhitelistedVaults}
                  className="mt-2 text-sm text-red-700 hover:text-red-900 underline"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Vault List Cards */}
            {!loading && !error && availableVaults.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {availableVaults.map((vault) => (
                  <div
                    key={vault.address}
                    onClick={() => handleVaultClick(vault)}
                    className="p-6 border-2 border-slate-200 bg-white rounded-xl cursor-pointer transition-all hover:border-blue-400 hover:shadow-lg group"
                  >
                    {/* Token Info with Status Badge */}
                    <div className="flex items-center justify-between gap-3 mb-6">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {/* Token Logo */}
                        {vault.tokenLogoUri ? (
                          <img
                            src={vault.tokenLogoUri.replace(
                              "ipfs://",
                              "https://gateway.pinata.cloud/ipfs/",
                            )}
                            alt={vault.tokenSymbol}
                            className="w-12 h-12 rounded-full object-contain border-2 border-gray-200 shadow-sm flex-shrink-0 bg-white p-1"
                            onError={(e) => {
                              e.currentTarget.outerHTML = `<div class="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-sm flex-shrink-0">${vault.tokenSymbol?.[0] || "T"}</div>`;
                            }}
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-sm flex-shrink-0">
                            {vault.tokenSymbol?.[0] || "T"}
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-bold text-gray-900 truncate">
                            {vault.tokenName}
                          </h3>
                          <p className="text-sm text-gray-500">
                            {vault.tokenSymbol}
                          </p>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold flex-shrink-0 ${
                          vault.isInitialized
                            ? "bg-green-100 text-green-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {vault.isInitialized ? "Active" : "Draft"}
                      </span>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">SPL Mint</p>
                        <p className="text-sm font-mono font-medium text-gray-900">
                          {vault.splTokenMint.slice(0, 4)}...
                          {vault.splTokenMint.slice(-4)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Inco Mint</p>
                        <p className="text-sm font-mono font-medium text-gray-900">
                          {vault.incoTokenMint.slice(0, 4)}...
                          {vault.incoTokenMint.slice(-4)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ExchangeShell>
      </div>
    </Padder>
  );
};

export default WrapPage;
