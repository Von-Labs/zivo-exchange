"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import Header from "@/components/header";
import Padder from "@/components/padder";
import ExchangeShell from "@/components/exchange/exchange-shell";
import WrapToken from "@/components/wrap-token";
import UnwrapToken from "@/components/unwrap-token";
import { ZIVO_WRAP_PROGRAM_ID, isTokenWhitelisted } from "@/utils/constants";
import { fetchTokenMetadata } from "@/utils/helius";
import bs58 from "bs58";

type TabType = "wrap" | "unwrap";

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

const WrapTokenPage = () => {
  const params = useParams();
  const router = useRouter();
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();

  const splTokenAddress = params.splTokenAddress as string;

  const [activeTab, setActiveTab] = useState<TabType>("wrap");
  const [selectedVault, setSelectedVault] = useState<VaultData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const VAULT_DISCRIMINATOR = [211, 8, 232, 43, 2, 152, 117, 119];

  // Fetch vault for the specific SPL token
  useEffect(() => {
    if (anchorWallet && splTokenAddress) {
      fetchVaultForToken();
    }
  }, [anchorWallet, splTokenAddress]);

  const fetchVaultForToken = async () => {
    setLoading(true);
    setError("");

    try {
      // Validate that the token is whitelisted
      if (!isTokenWhitelisted(splTokenAddress)) {
        setError("This token is not whitelisted. Please select a whitelisted token from the vault list.");
        setLoading(false);
        return;
      }

      console.log("Fetching vault for SPL token:", splTokenAddress);

      // Fetch all vault accounts
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

      console.log(`Found ${accounts.length} vault accounts`);

      // Find vault matching the SPL token
      for (const { pubkey, account } of accounts) {
        try {
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

          // Check if this is the vault we're looking for
          if (splMintStr === splTokenAddress) {
            console.log("Found matching vault!");

            // Fetch token metadata
            const metadata = await fetchTokenMetadata(splMintStr);

            setSelectedVault({
              address: pubkey.toBase58(),
              authority: authority.toBase58(),
              splTokenMint: splMintStr,
              incoTokenMint: incoTokenMint.toBase58(),
              vaultTokenAccount: vaultTokenAccount.toBase58(),
              isInitialized,
              tokenName: metadata?.name || "Unknown Token",
              tokenSymbol: metadata?.symbol || "TOKEN",
              tokenLogoUri: metadata?.logoURI,
            });
            setLoading(false);
            return;
          }
        } catch (err) {
          console.error("Error parsing vault:", err);
        }
      }

      // No matching vault found
      setError(`No vault found for token ${splTokenAddress}. Please ensure the vault is initialized.`);
      setLoading(false);
    } catch (err: any) {
      console.error("Error fetching vault:", err);
      setError(err.message || "Failed to fetch vault");
      setLoading(false);
    }
  };

  return (
    <Padder>
      <Header />
      <div className="font-sans text-slate-900">
        <ExchangeShell>
          <div className="mx-auto max-w-7xl space-y-6">
            {/* Back Button */}
            <button
              onClick={() => router.push("/wrap")}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Vault List
            </button>

            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                {selectedVault?.tokenSymbol || "Token"}
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900">
                {selectedVault?.tokenName || "Wrap & Unwrap"}
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Wrap SPL tokens to encrypted Inco tokens and back
              </p>
            </div>

            {/* Loading State */}
            {loading && (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="text-gray-600 mt-2">Loading vault...</p>
              </div>
            )}

            {/* Error State */}
            {error && !loading && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-600 text-sm">{error}</p>
                <button
                  onClick={() => router.push("/wrap")}
                  className="mt-2 text-sm text-red-700 hover:text-red-900 underline"
                >
                  Back to Vault List
                </button>
              </div>
            )}

            {/* Wrap/Unwrap Interface */}
            {!loading && !error && selectedVault && (
              <>
                {/* Tab Navigation */}
                <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setActiveTab("wrap")}
                      className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                        activeTab === "wrap"
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      Wrap
                    </button>
                    <button
                      onClick={() => setActiveTab("unwrap")}
                      className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                        activeTab === "unwrap"
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      Unwrap
                    </button>
                  </div>
                </div>

                {/* Tab Content */}
                <div className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
                  {activeTab === "wrap" && <WrapToken selectedVault={selectedVault} />}
                  {activeTab === "unwrap" && <UnwrapToken selectedVault={selectedVault} />}
                </div>
              </>
            )}
          </div>
        </ExchangeShell>
      </div>
    </Padder>
  );
};

export default WrapTokenPage;
