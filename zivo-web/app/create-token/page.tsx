"use client";

import { useState } from "react";
import Header from "@/components/header";
import Padder from "@/components/padder";
import SplTokenCreator from "@/components/spl-token-creator";
import IncoTokenCreator from "@/components/inco-token-creator";
import TabNavigation from "@/components/tab-navigation";
import ExchangeShell from "@/components/exchange/exchange-shell";

type TabType = "spl" | "inco";

const CreateTokenPage = () => {
  const [activeTab, setActiveTab] = useState<TabType>("spl");

  return (
    <Padder>
      <Header />
      <div className="font-sans text-slate-900">
        <ExchangeShell>
          <div className="mx-auto max-w-2xl space-y-6">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Tokens
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900">
                Create Token
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Launch SPL or INCO assets with the same private flow.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
              <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
              {activeTab === "spl" ? <SplTokenCreator /> : <IncoTokenCreator />}
            </div>
          </div>
        </ExchangeShell>
      </div>
    </Padder>
  );
};

export default CreateTokenPage;
