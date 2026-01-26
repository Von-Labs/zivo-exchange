const ChartPanel = () => {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Market
          </p>
          <h2 className="text-lg font-semibold text-slate-900">
            ETH / USDT · 1h · Binance
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
          {["5m", "15m", "1h", "4h", "1d"].map((interval) => (
            <button
              key={interval}
              className={`rounded-full px-3 py-1 ${
                interval === "1h"
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-500"
              }`}
            >
              {interval}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)] p-6">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
          <span>Chart placeholder</span>
          <span>Loading data</span>
        </div>
        <div className="mt-6 h-64 rounded-xl bg-[linear-gradient(90deg,rgba(148,163,184,0.15)_1px,transparent_1px),linear-gradient(180deg,rgba(148,163,184,0.12)_1px,transparent_1px)] bg-[size:32px_32px]" />
        <div className="mt-6 grid gap-3 text-xs text-slate-500 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
              Open
            </p>
            <p className="mt-1 text-base font-semibold text-slate-900">2,961.66</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
              Volume
            </p>
            <p className="mt-1 text-base font-semibold text-slate-900">12.4k</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
              Change
            </p>
            <p className="mt-1 text-base font-semibold text-emerald-600">+0.24%</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ChartPanel;
