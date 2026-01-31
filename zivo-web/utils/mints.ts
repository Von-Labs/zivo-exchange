export const SPL_WRAPPED_SOL_MINT =
  "So11111111111111111111111111111111111111112";
export const SPL_USDC_MINT = "HGnzmVYGMMXsH7ST34TJgL6GzBHP7LbiydL36Gm4Sz75";

export const INCO_USDC_MINT = "PSibFffx86SUaNQwhGT3i6TWnomRPTfsHAmGZjdTvp2";
export const INCO_WSOL_MINT = "Aja1ciD63vJS5MRoudg8iEvXEeWhYuvGjrcY6XT8eTfo";

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
