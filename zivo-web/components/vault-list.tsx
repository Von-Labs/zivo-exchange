"use client";

import { useState, useEffect } from "react";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { ZIVO_WRAP_PROGRAM_ID, isTokenWhitelisted } from "@/utils/constants";
import { fetchTokenMetadata } from "@/utils/helius";
import bs58 from "bs58";

interface TokenMetadata {
  name: string;
  symbol: string;
  logo?: string;
}

interface VaultData {
  address: string;
  authority: string;
  splTokenMint: string;
  incoTokenMint: string;
  vaultTokenAccount: string;
  isInitialized: boolean;
  splMetadata?: TokenMetadata;
}

interface VaultListProps {
  onSelectVault: (vault: VaultData) => void;
}

const VaultList = ({ onSelectVault }: VaultListProps) => {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const anchorWallet = useAnchorWallet();

  const [vaults, setVaults] = useState<VaultData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const VAULT_DISCRIMINATOR = [211, 8, 232, 43, 2, 152, 117, 119];

  const fetchTokenMetadataForVault = async (mintAddress: string): Promise<TokenMetadata | undefined> => {
    try {
      // Special handling for wrapped SOL
      if (mintAddress === "So11111111111111111111111111111111111111112") {
        return {
          name: "Wrapped SOL",
          symbol: "SOL",
          logo: "https://statics.solscan.io/solscan-img/solana_icon.svg",
        };
      }

      // Use Helius to fetch token metadata
      const metadata = await fetchTokenMetadata(mintAddress);

      if (metadata) {
        return {
          name: metadata.name || mintAddress.slice(0, 8),
          symbol: metadata.symbol || "TOKEN",
          logo: metadata.logoURI,
        };
      }

      return {
        name: mintAddress.slice(0, 8),
        symbol: "TOKEN",
      };
    } catch (err) {
      console.error("Error fetching token metadata:", err);
      return {
        name: mintAddress.slice(0, 8),
        symbol: "TOKEN",
      };
    }
  };

  const fetchVaults = async () => {
    if (!anchorWallet) return;

    setLoading(true);
    setError("");

    try {
      console.log("Fetching vaults for program:", ZIVO_WRAP_PROGRAM_ID.toBase58());

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
      const vaultList: VaultData[] = [];

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

          // Only add if SPL token is whitelisted
          if (!isTokenWhitelisted(splMintStr)) {
            console.log("SPL token not whitelisted, skipping:", splMintStr);
            continue;
          }

          console.log("SPL token is whitelisted, adding vault");

          // Fetch SPL token metadata using Helius
          const splMetadata = await fetchTokenMetadataForVault(splMintStr);
          console.log("Fetched metadata for vault:", splMintStr, splMetadata);

          vaultList.push({
            address: pubkey.toBase58(),
            authority: authority.toBase58(),
            splTokenMint: splMintStr,
            incoTokenMint: incoTokenMint.toBase58(),
            vaultTokenAccount: vaultTokenAccount.toBase58(),
            isInitialized,
            splMetadata,
          });
        } catch (err) {
          console.error("Error parsing vault:", err);
        }
      }

      setVaults(vaultList);
    } catch (err: any) {
      console.error("Error fetching vaults:", err);
      setError(err.message || "Failed to fetch vaults");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (anchorWallet) {
      fetchVaults();
    }
  }, [anchorWallet]);

  if (!publicKey) {
    return (
      <div className="text-center text-gray-500 py-8">
        Please connect your wallet to view vaults
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="text-gray-600 mt-2">Loading vaults...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-600 text-sm">{error}</p>
        <button
          onClick={fetchVaults}
          className="mt-2 text-sm text-red-700 hover:text-red-900 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (vaults.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600 mb-4">No vaults found</p>
        <p className="text-sm text-gray-500">
          Create a vault in the "Initialize Vault" tab to get started
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Available Vaults ({vaults.length})</h3>
        <button
          onClick={fetchVaults}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          Refresh
        </button>
      </div>

      <div className="grid gap-4">
        {vaults.map((vault) => (
          <div
            key={vault.address}
            onClick={() => onSelectVault(vault)}
            className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition-all"
          >
            <div className="grid grid-cols-1 gap-3">
              {/* Token Header with Logo */}
              <div className="flex items-center gap-3 pb-2 border-b border-gray-100">
                {vault.splMetadata?.logo ? (
                  <img
                    src={vault.splMetadata.logo}
                    alt={vault.splMetadata.symbol}
                    className="w-10 h-10 rounded-full border-2 border-gray-200 object-contain bg-white p-1"
                    onError={(e) => {
                      console.error('Failed to load logo:', vault.splMetadata?.logo);
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-bold">
                    {vault.splMetadata?.symbol?.slice(0, 2) || "?"}
                  </div>
                )}
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900">
                    {vault.splMetadata?.name || "Unknown Token"}
                  </h4>
                  <p className="text-sm text-gray-500">
                    {vault.splMetadata?.symbol || "TOKEN"}
                  </p>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  vault.isInitialized
                    ? "bg-green-100 text-green-800"
                    : "bg-yellow-100 text-yellow-800"
                }`}>
                  {vault.isInitialized ? "Active" : "Pending"}
                </span>
              </div>

              {/* Token Addresses */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-500">SPL:</span>
                  <p className="font-mono text-green-600">
                    {vault.splTokenMint.slice(0, 6)}...
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Inco:</span>
                  <p className="font-mono text-purple-600">
                    {vault.incoTokenMint.slice(0, 6)}...
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default VaultList;
