"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { isAdmin } from "@/utils/constants";
import InitializeShieldedPool from "./initialize-shielded-pool";
import WrapAndShield from "./wrap-and-shield";
import CommitmentHistory from "./commitment-history";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
    logo?: string;
  };
}

interface ShieldedOperationsProps {
  vaults: VaultData[];
  loading?: boolean;
}

type Tab = "init" | "wrap-shield" | "history";

const ShieldedOperations = ({ vaults, loading }: ShieldedOperationsProps) => {
  const { publicKey } = useWallet();
  const userIsAdmin = publicKey ? isAdmin(publicKey.toBase58()) : false;

  const [selectedVault, setSelectedVault] = useState<VaultData | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>(userIsAdmin ? "init" : "wrap-shield");

  const handleVaultSelect = (vault: VaultData) => {
    setSelectedVault(vault);
    // Auto-switch to wrap-shield if vault selected
    if (activeTab === "init") {
      setActiveTab("wrap-shield");
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="text-gray-600 mt-2">Loading vaults...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-4xl">🛡️</span>
        <div>
          <h1 className="text-3xl font-bold">Shielded Operations</h1>
          <p className="text-gray-600">
            Private transactions using Zero-Knowledge proofs
          </p>
        </div>
      </div>

      {/* Vault Selector */}
      {vaults.length > 0 && (
        <div>
          <label className="block text-sm font-medium mb-2">
            Select Vault:
          </label>
          <Select
            value={selectedVault?.address || ""}
            onValueChange={(value) => {
              const vault = vaults.find((v) => v.address === value);
              if (vault) handleVaultSelect(vault);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a vault..." />
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
      )}

      {vaults.length === 0 && (
        <div className="p-8 text-center border-2 border-dashed border-gray-300 rounded-lg">
          <div className="text-4xl mb-4">🏦</div>
          <p className="text-gray-600 mb-2">No vaults available</p>
          <p className="text-sm text-gray-500">
            Please initialize a vault in the "Initialize Vault" tab first
          </p>
        </div>
      )}

      {/* Tabs */}
      {vaults.length > 0 && (
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {userIsAdmin && (
              <button
                onClick={() => setActiveTab("init")}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === "init"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                🔒 Initialize Pool
              </button>
            )}
            <button
              onClick={() => setActiveTab("wrap-shield")}
              disabled={!selectedVault}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "wrap-shield"
                  ? "border-blue-500 text-blue-600"
                  : !selectedVault
                  ? "border-transparent text-gray-300 cursor-not-allowed"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Wrap & Shield
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "history"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Commitment History
            </button>
          </nav>
        </div>
      )}

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === "init" && userIsAdmin && selectedVault && (
          <InitializeShieldedPool
            vault={selectedVault}
            onSuccess={() => setActiveTab("wrap-shield")}
          />
        )}

        {activeTab === "init" && userIsAdmin && !selectedVault && vaults.length > 0 && (
          <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
            <p className="text-gray-500">Please select a vault above</p>
          </div>
        )}

        {activeTab === "wrap-shield" && selectedVault && (
          <WrapAndShield vault={selectedVault} />
        )}

        {activeTab === "wrap-shield" && !selectedVault && (
          <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
            <p className="text-gray-500">Please select a vault above</p>
          </div>
        )}

        {activeTab === "history" && <CommitmentHistory />}
      </div>

      {/* Feature Notice */}
      <div className="mt-8 p-4 bg-purple-50 border border-purple-200 rounded-lg">
        <h4 className="font-semibold text-purple-900 mb-2">
          🚧 Phase 1 - MVP Features
        </h4>
        <ul className="text-sm text-purple-800 space-y-1 list-disc list-inside">
          <li>✅ Initialize Shielded Pool</li>
          <li>✅ Wrap & Shield tokens with commitments</li>
          <li>✅ Track commitment history</li>
          <li>🔜 Shielded Transfer (Coming in Phase 2)</li>
          <li>🔜 Unwrap from Note (Coming in Phase 2)</li>
        </ul>
      </div>
    </div>
  );
};

export default ShieldedOperations;
