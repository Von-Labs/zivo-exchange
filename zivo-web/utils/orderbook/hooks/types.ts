import type { PublicKey } from "@solana/web3.js";

export type OrderbookSlotView = {
  owner: string;
  clientOrderId: string;
  escrowBaseAmount: string;
  escrowQuoteAmount: string;
  isActive: boolean;
};

export type OrderbookStateView = {
  admin: string;
  orderSeq: string;
  requireAttestation: boolean;
  incoBaseMint: string;
  incoQuoteMint: string;
  incoVaultAuthority: string;
  incoBaseVault: string;
  incoQuoteVault: string;
  bestBid: OrderbookSlotView;
  bestAsk: OrderbookSlotView;
  bidCount: number;
  askCount: number;
  lastMatchHandle: string;
};

export type OrderView = {
  address: string;
  owner: string;
  side: "Bid" | "Ask" | "Unknown";
  price: string;
  seq: string;
  remainingHandle: string;
  isOpen: boolean;
  isFilled?: boolean;
  isClaimed?: boolean;
  claimPlaintextAmount?: string;
};

export type UseOrderbookStateParams = {
  baseMint?: PublicKey;
  quoteMint?: PublicKey;
  refetchInterval?: number;
};

export type UseOrderbookOrdersParams = UseOrderbookStateParams & {
  includeClosed?: boolean;
};

export type UseIncoAccountStatusParams = UseOrderbookStateParams;

export type EnsureIncoAccountsParams = {
  baseMint?: PublicKey;
  quoteMint?: PublicKey;
};

export type EnsureIncoAccountsResult = {
  baseIncoAccount: PublicKey;
  quoteIncoAccount: PublicKey;
  signature?: string;
};

export type PlaceOrderWithIncoAccountsParams = {
  side: "buy" | "sell";
  amount: string;
  price: string;
  baseMint?: PublicKey;
  quoteMint?: PublicKey;
};

export type PlaceAndMatchOrderWithIncoAccountsParams = {
  makerOrderAddress: string;
  makerOwner: string;
  makerSide: "Bid" | "Ask";
  price: string;
  amount: string;
  baseMint?: PublicKey;
  quoteMint?: PublicKey;
};
