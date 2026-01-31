export const SPL_WRAPPED_SOL_MINT =
  "So11111111111111111111111111111111111111112";
export const SPL_USDC_MINT = "HGnzmVYGMMXsH7ST34TJgL6GzBHP7LbiydL36Gm4Sz75";

export const INCO_USDC_MINT = "Dt7k5shv2nfGX8EaZpsk7BYeZtqm3AHZW7Jf57C1PkQk";
export const INCO_WSOL_MINT = "9Esa4P7FRPJueFyt3ZEq1S42q3F67JSQzhGqTtDcTSWr";

export const SPL_USDC_DECIMALS = 6;
export const SPL_WRAPPED_SOL_DECIMALS = 9;

export const getSplDecimalsForIncoMint = (
  incoMint: string,
): number | null => {
  if (incoMint === INCO_WSOL_MINT) return SPL_WRAPPED_SOL_DECIMALS;
  if (incoMint === INCO_USDC_MINT) return SPL_USDC_DECIMALS;
  return null;
};

export const getSplMintForIncoMint = (incoMint: string): string | null => {
  if (incoMint === INCO_WSOL_MINT) return SPL_WRAPPED_SOL_MINT;
  if (incoMint === INCO_USDC_MINT) return SPL_USDC_MINT;
  return null;
};
