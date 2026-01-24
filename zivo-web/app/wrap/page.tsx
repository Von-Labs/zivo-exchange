"use client";

import { useState } from "react";
import Header from "@/components/header";
import Padder from "@/components/padder";
import InitializeVault from "@/components/initialize-vault";
import WrapToken from "@/components/wrap-token";
import UnwrapToken from "@/components/unwrap-token";
import VaultList from "@/components/vault-list";

type TabType = "initialize" | "wrap" | "unwrap";

interface VaultData {
  address: string;
  authority: string;
  splTokenMint: string;
  incoTokenMint: string;
  vaultTokenAccount: string;
  isInitialized: boolean;
}

const WrapPage = () => {
  const [activeTab, setActiveTab] = useState<TabType>("wrap");
  const [selectedVault, setSelectedVault] = useState<VaultData | null>(null);

  const handleSelectVault = (vault: VaultData) => {
    setSelectedVault(vault);
    setActiveTab("wrap");
  };

  return (
    <Padder>
      <Header />
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2 text-center">
          Token Wrapper
        </h1>
        <p className="text-gray-600 text-center mb-8">
          Wrap SPL tokens to encrypted Inco tokens and back
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left sidebar - Vault List */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-lg p-6 sticky top-4">
              <h2 className="text-xl font-bold mb-4">Vaults</h2>
              <VaultList onSelectVault={handleSelectVault} />
            </div>
          </div>

          {/* Right content - Tabs */}
          <div className="lg:col-span-2">
            {/* Tab Navigation */}
            <div className="flex justify-center mb-6 border-b border-gray-200 overflow-x-auto">
              {/* Only show Initialize tab when no vault is selected */}
              {!selectedVault && (
                <button
                  onClick={() => setActiveTab("initialize")}
                  className={`px-4 py-3 font-medium transition-colors whitespace-nowrap ${
                    activeTab === "initialize"
                      ? "border-b-2 border-blue-600 text-blue-600"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Initialize Vault
                </button>
              )}
              {/* Only show Wrap and Unwrap tabs when vault is selected */}
              {selectedVault && (
                <>
                  <button
                    onClick={() => setActiveTab("wrap")}
                    className={`px-4 py-3 font-medium transition-colors whitespace-nowrap ${
                      activeTab === "wrap"
                        ? "border-b-2 border-blue-600 text-blue-600"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    Wrap
                  </button>
                  <button
                    onClick={() => setActiveTab("unwrap")}
                    className={`px-4 py-3 font-medium transition-colors whitespace-nowrap ${
                      activeTab === "unwrap"
                        ? "border-b-2 border-blue-600 text-blue-600"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    Unwrap
                  </button>
                </>
              )}
            </div>

            {/* Tab Content */}
            <div className="bg-white rounded-lg shadow-lg p-8">
              {activeTab === "initialize" && <InitializeVault />}
              {activeTab === "wrap" && <WrapToken selectedVault={selectedVault} />}
              {activeTab === "unwrap" && <UnwrapToken selectedVault={selectedVault} />}
            </div>
          </div>
        </div>
      </div>
    </Padder>
  );
};

export default WrapPage;
