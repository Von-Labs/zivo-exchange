const OrdersPanel = () => {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Orders
          </p>
          <h2 className="text-lg font-semibold text-slate-900">Active Orders</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
          {["Open", "Filled", "Canceled"].map((filter) => (
            <button
              key={filter}
              className={`rounded-full px-3 py-1 ${
                filter === "Open"
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-500"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
        <div className="grid grid-cols-5 gap-4 bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          <span>Status</span>
          <span>Side</span>
          <span>Asset</span>
          <span>Order Value</span>
          <span>Time</span>
        </div>
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-sm text-slate-500">
          <span className="text-base font-semibold text-slate-700">No open orders</span>
          <span className="text-xs text-slate-400">
            Connect your wallet to view live activity.
          </span>
        </div>
      </div>
    </section>
  );
};

export default OrdersPanel;
