# Zivo Orderbook (Inco) — Current Design

This document captures the current on-chain design, constraints, and near-term roadmap.

## Architecture summary

- **Orderbook program:** `programs/zivo-v1` (Anchor).
- **Inco programs:** `inco-token` (encrypted balances/transfers) + `inco-lightning` (handles/ops).
- **Off-chain relayer:** selects maker orders (best price + FIFO) and submits `match_order`.
- **Markets:** one on-chain market per base/quote pair (distinct market PDA + vaults).

## Current on-chain flow

1) **Initialize** (`initialize`)
- Creates a market PDA using seeds `orderbook_market_v1` + base mint + quote mint.
- Stores admin (matcher authority) and attestation flag.
- Records Inco mints/vaults and vault authority PDA (`inco_vault_authority_v12` + market).

2) **Place order** (`place_order`)
- Creates an `Order` PDA (`order_v1` + market + owner + seq).
- Stores public `price` and encrypted `remaining_handle`.
- Escrows funds into the vault (base for asks, quote for bids).

3) **Match order** (`match_order`)
- Admin relayer selects a maker order and submits a fill.
- On-chain validates:
  - Admin signer
  - Order open
  - Side mismatch
  - Price match
- Encrypted ops:
  - `actual = min(requested, remaining)`
  - `remaining = remaining - actual`
  - Optional attested verification when `require_attestation = true`
- Transfers:
  - Maker escrow → taker (vault → taker)
  - Taker payment → maker escrowed in order vault (claimable)

4) **Maker claim filled order** (`maker_claim_filled_order`)
- Maker claims the filled amount from the order vault after a match.
- On-chain validates:
  - Maker signer matches order owner
  - Order is filled and not claimed
- Transfers:
  - Order vault → maker (confidential transfer)

5) **Cancel order** (`cancel_order`)
- Trader provides ciphertext for remaining amount.
- Returns escrow to trader.

6) **Close order** (`close_order`)
- Closes order if remaining is zero (attested when enabled).

## Current capabilities

- Public price, confidential size/remaining amount.
- Partial and full fills supported.
- On-chain enforcement of size/remaining correctness (attested in production).
- Relayer-driven matching with FIFO ordering by `seq`.
- Multiple markets supported via distinct market PDAs per base/quote pair.

## Limits / caps (current)

- Price-time priority is off-chain (relayer enforced).
- No on-chain orderbook depth/queue.
- Taker must sign match tx (for their payment transfer).
- Ciphertext sizes increase tx size; relayer may need to split flows or use LUTs if needed.

## Roadmap / future plans

- Add order indexing and queue account for on-chain priority.
- Add reduce/cancel by encrypted amount without providing ciphertext.
- Integrate attestation flows into relayer pipeline for production.
- Add orderbook snapshots and indexing for zivo-web.
- Explore handle-based transfers if supported by Inco token program in the future.
