export const SPL_WRAPPED_SOL_MINT =
  "So11111111111111111111111111111111111111112";
export const SPL_USDC_MINT = "ALS5QfhVoWZ4uQgMfZmrxLEgmWkcdqcu8RvJqZd74hBf";

export const INCO_USDC_MINT = "BJNk79o4w2CRmgBfP7A76c3oBtDJGjejBSwGaW945CZb";
export const INCO_WSOL_MINT = "6xdSaURq4wsespTZ2uxqbiqf6epqRp2cnSywkrMN5SAo";

export const SPL_USDC_DECIMALS = 6;
export const SPL_WRAPPED_SOL_DECIMALS = 9;

export const getSplDecimalsForIncoMint = (
  incoMint: string,
): number | null => {
  if (incoMint === INCO_WSOL_MINT) return SPL_WRAPPED_SOL_DECIMALS;
  if (incoMint === INCO_USDC_MINT) return SPL_USDC_DECIMALS;
  return null;
};
