"use client";

import Header from "@/components/header";
import Padder from "@/components/padder";
import ExchangeShell from "@/components/exchange/exchange-shell";
import AirdropManager from "@/components/airdrop-manager";

const AirdropPage = () => {
  return (
    <Padder>
      <Header />
      <div className="font-sans text-slate-900">
        <ExchangeShell>
          <div className="mx-auto max-w-4xl space-y-6">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Tokens
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900">
                Token Airdrop
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Request tokens from our whitelist (500 tokens per hour limit)
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
              <AirdropManager />
            </div>
          </div>
        </ExchangeShell>
      </div>
    </Padder>
  );
};

export default AirdropPage;
