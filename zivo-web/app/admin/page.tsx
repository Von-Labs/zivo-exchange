"use client";

import { useState } from "react";
import Header from "@/components/header";
import Padder from "@/components/padder";
import ExchangeShell from "@/components/exchange/exchange-shell";
import InitializeVault from "@/components/initialize-vault";
import SplTokenCreator from "@/components/spl-token-creator";
import IncoTokenCreator from "@/components/inco-token-creator";
import WhitelistManager from "@/components/whitelist-manager";

type TabType = "vault" | "spl" | "inco" | "whitelist";

const AdminPage = () => {
  const [activeTab, setActiveTab] = useState<TabType>("vault");

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
              </div>
            </div>

            {/* Tab Content */}
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
              {activeTab === "vault" && <InitializeVault />}
              {activeTab === "spl" && <SplTokenCreator />}
              {activeTab === "inco" && <IncoTokenCreator />}
              {activeTab === "whitelist" && <WhitelistManager />}
            </div>
          </div>
        </ExchangeShell>
      </div>
    </Padder>
  );
};

export default AdminPage;
