type BalanceItem = {
  label: string;
  value: string | null;
};

const TradeAmountHeader = ({ balances }: { balances: BalanceItem[] }) => {
  const balanceLabel = balances
    .map((balance) => `${balance.value ?? "--"} ${balance.label}`)
    .join(" · ");

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-500">
      <span>Amount</span>
      <span className="text-slate-400">Balances: {balanceLabel}</span>
    </div>
  );
};

export default TradeAmountHeader;
