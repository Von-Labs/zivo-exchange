"use client";

import { useState, useEffect } from "react";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
import bs58 from "bs58";
import Header from "@/components/header";
import Padder from "@/components/padder";
import ExchangeShell from "@/components/exchange/exchange-shell";
import InitializeVault from "@/components/initialize-vault";
import SplTokenCreator from "@/components/spl-token-creator";
import IncoTokenCreator from "@/components/inco-token-creator";
import WhitelistManager from "@/components/whitelist-manager";
import InitializeShieldedPool from "@/components/initialize-shielded-pool";
import { ZIVO_WRAP_PROGRAM_ID, isTokenWhitelisted, isAdmin } from "@/utils/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TabType = "vault" | "spl" | "inco" | "whitelist" | "shielded";

interface VaultData {
  address: string;
  authority: string;
  splTokenMint: string;
  incoTokenMint: string;
  vaultTokenAccount: string;
  isInitialized: boolean;
  splMetadata?: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

const AdminPage = () => {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const [activeTab, setActiveTab] = useState<TabType>("vault");
  const [vaults, setVaults] = useState<VaultData[]>([]);
  const [loadingVaults, setLoadingVaults] = useState(false);
  const [selectedVault, setSelectedVault] = useState<VaultData | null>(null);

  useEffect(() => {
    if (anchorWallet) {
      fetchVaults();
    }
  }, [anchorWallet]);

  const fetchVaults = async () => {
    if (!anchorWallet) return;

    setLoadingVaults(true);
    try {
      const VAULT_DISCRIMINATOR = [211, 8, 232, 43, 2, 152, 117, 119];
      const accounts = await connection.getProgramAccounts(ZIVO_WRAP_PROGRAM_ID, {
        filters: [
          {
            memcmp: {
              offset: 0,
              bytes: bs58.encode(Buffer.from(VAULT_DISCRIMINATOR)),
            },
          },
        ],
      });

      const vaultList = await Promise.all(
        accounts.map(async ({ pubkey, account }) => {
          const data = account.data;
          let offset = 8;

          const authority = new PublicKey(data.slice(offset, offset + 32));
          offset += 32;
          const splTokenMint = new PublicKey(data.slice(offset, offset + 32));
          offset += 32;
          const incoTokenMint = new PublicKey(data.slice(offset, offset + 32));
          offset += 32;
          const vaultTokenAccount = new PublicKey(data.slice(offset, offset + 32));
          offset += 32;
          const isInitialized = data[offset] === 1;

          // Only include whitelisted tokens
          if (!isTokenWhitelisted(splTokenMint.toBase58())) {
            return null;
          }

          // Fetch SPL token metadata
          let splMetadata = {
            name: "Unknown Token",
            symbol: "TOKEN",
            decimals: 9,
          };

          try {
            const mintInfo = await getMint(connection, splTokenMint);

            const tokenMap: Record<string, { name: string; symbol: string }> = {
              "So11111111111111111111111111111111111111112": { name: "Wrapped SOL", symbol: "SOL" },
              "ALS5QfhVoWZ4uQgMfZmrxLEgmWkcdqcu8RvJqZd74hBf": { name: "USD Coin", symbol: "USDC" },
            };

            const tokenInfo = tokenMap[splTokenMint.toBase58()];
            if (tokenInfo) {
              splMetadata = {
                name: tokenInfo.name,
                symbol: tokenInfo.symbol,
                decimals: mintInfo.decimals,
              };
            } else {
              splMetadata.decimals = mintInfo.decimals;
            }
          } catch (err) {
            console.error("Error fetching token metadata:", err);
          }

          return {
            address: pubkey.toBase58(),
            authority: authority.toBase58(),
            splTokenMint: splTokenMint.toBase58(),
            incoTokenMint: incoTokenMint.toBase58(),
            vaultTokenAccount: vaultTokenAccount.toBase58(),
            isInitialized,
            splMetadata,
          };
        })
      );

      const filteredVaults = vaultList.filter((v): v is NonNullable<typeof v> => v !== null);
      setVaults(filteredVaults);
    } catch (err) {
      console.error("Error fetching vaults:", err);
    } finally {
      setLoadingVaults(false);
    }
  };

  return (
    <Padder>
      <Header />
      <div className="font-sans text-slate-900">
        <ExchangeShell>
          <div className="mx-auto max-w-4xl space-y-6">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Admin Panel
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900">
                Token Management
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Airdrop tokens, create new tokens, and initialize vaults
              </p>
            </div>

            {/* Tab Navigation */}
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab("vault")}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeTab === "vault"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Initialize Vault
                </button>
                <button
                  onClick={() => setActiveTab("spl")}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeTab === "spl"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Create SPL
                </button>
                <button
                  onClick={() => setActiveTab("inco")}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeTab === "inco"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Create INCO
                </button>
                <button
                  onClick={() => setActiveTab("whitelist")}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeTab === "whitelist"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Whitelist
                </button>
                <button
                  onClick={() => setActiveTab("shielded")}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeTab === "shielded"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  🛡️ Init Shield Pool
                </button>
              </div>
            </div>

            {/* Tab Content */}
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
              {activeTab === "vault" && <InitializeVault />}
              {activeTab === "spl" && <SplTokenCreator />}
              {activeTab === "inco" && <IncoTokenCreator />}
              {activeTab === "whitelist" && <WhitelistManager />}
              {activeTab === "shielded" && (
                <div className="space-y-6">
                  {loadingVaults ? (
                    <div className="text-center py-8">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      <p className="text-gray-600 mt-2">Loading vaults...</p>
                    </div>
                  ) : vaults.length === 0 ? (
                    <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                      <p className="text-gray-500">No vaults available. Please initialize a vault first.</p>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Select Vault:
                        </label>
                        <Select
                          value={selectedVault?.address || ""}
                          onValueChange={(value) => {
                            const vault = vaults.find((v) => v.address === value);
                            if (vault) setSelectedVault(vault);
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Choose a vault to initialize shielded pool..." />
                          </SelectTrigger>
                          <SelectContent>
                            {vaults.map((vault) => (
                              <SelectItem key={vault.address} value={vault.address}>
                                {vault.splMetadata?.name || "Unknown Token"} (
                                {vault.splMetadata?.symbol || "TOKEN"}) - {vault.address.slice(0, 8)}...
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {selectedVault && <InitializeShieldedPool vault={selectedVault} />}

                      {!selectedVault && (
                        <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                          <p className="text-gray-500">Please select a vault above</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </ExchangeShell>
      </div>
    </Padder>
  );
};

export default AdminPage;
