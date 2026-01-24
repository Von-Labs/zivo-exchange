"use client";

import Header from "@/components/header";
import Padder from "@/components/padder";
import ExchangeShell from "@/components/exchange/exchange-shell";
import MarketStrip from "@/components/exchange/market-strip";
import TradePanel from "@/components/exchange/trade-panel";
import ChartPanel from "@/components/exchange/chart-panel";
import OrdersPanel from "@/components/exchange/orders-panel";

const Page = () => {
  return (
    <Padder>
      <Header />
      <div className="text-slate-900">
        <ExchangeShell>
          <MarketStrip />
          <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            <TradePanel />
            <div className="flex flex-col gap-6">
              <ChartPanel />
              <OrdersPanel />
            </div>
          </div>
        </ExchangeShell>
      </div>
    </Padder>
  );
};

export default Page;
