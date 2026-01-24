const marketData = [
  { name: "Binance", price: "2,958.36", status: "LIVE" },
  { name: "Coinbase", price: "2,957.85", status: "LIVE" },
  { name: "Kraken", price: "2,957.17", status: "LIVE" },
  { name: "OKX", price: "2,962.14", status: "LIVE" },
];

const MarketStrip = () => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
      <div className="flex items-center gap-3">
        <span className="text-slate-900">BBO Feeds</span>
        <span className="h-1 w-1 rounded-full bg-slate-300" />
        <span className="text-[10px] font-medium uppercase text-slate-400">Composite</span>
      </div>
      <div className="flex flex-wrap items-center gap-6 text-[11px] tracking-[0.18em]">
        {marketData.map((market) => (
          <div key={market.name} className="flex items-center gap-2 text-slate-600">
            <span className="font-semibold text-slate-800">{market.name}</span>
            <span className="text-slate-400">${market.price}</span>
            <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">
              {market.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MarketStrip;
