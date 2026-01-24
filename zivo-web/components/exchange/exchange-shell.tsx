const ExchangeShell = ({ children }: { children: React.ReactNode }) => {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_60px_-40px_rgba(15,23,42,0.35)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.08),_transparent_55%)]" />
      <div className="pointer-events-none absolute -left-16 top-24 h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(16,185,129,0.18),_transparent_65%)]" />
      <div className="relative space-y-6 p-6 sm:p-8">{children}</div>
    </section>
  );
};

export default ExchangeShell;
