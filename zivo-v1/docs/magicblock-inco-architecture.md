# Zivo Orderbook Flow (Inco)

This repo uses a single on-chain program (`programs/zivo-v1`) for the L1 orderbook.

## Components

- **L1 orderbook:** `programs/zivo-v1` (Anchor). Owns PDAs, escrows encrypted funds, and handles matching/settlement on Solana L1.
- **Inco programs:** External `inco-token` and `inco-lightning` programs provide encrypted balances and handle creation (`new_euint128`, encrypted `transfer`).
- **Client/tests:** `tests/zivo-v1.ts` drives the flow on devnet.

## Current L1 Flow

1) **Initialize** (`initialize`): creates `orderbook_state_v13` PDA, verifies Inco mints/vaults (owned by `inco-token`), and records the Inco vault authority PDA (`inco_vault_authority_v10`).
2) **User deposits** (`initialize_deposit`): creates a per-user `deposit_v8` PDA that points at the user’s Inco base/quote accounts (must match the Inco mints from state).
3) **Place order** (`place_order`): for bids, encrypted quote amount is transferred into the quote vault; for asks, encrypted base amount is transferred into the base vault. Price/qty ciphertexts are converted to Inco handles via `inco_lightning::new_euint128`. Only one best bid and one best ask are tracked.
4) **Submit match** (`submit_match`): stores a match record (handles + owners). Requires a validator signer; tests use the payer.
5) **Settle match** (`settle_match`): moves encrypted base/quote amounts from vaults back to the matched owners using Inco `transfer` CPIs signed by the vault authority PDA.
6) **Cancel order** (`cancel_order`): returns the escrowed encrypted amount from the appropriate vault back to the trader’s Inco account.

## PDAs and Seeds

- Orderbook state: `orderbook_state_v13`
- Deposit PDA: `deposit_v8` + user pubkey
- Vault authority: `inco_vault_authority_v10`
- Match record: `match_record` + state + `match_id`

## Quick devnet test notes

- Ensure Inco token/lightning programs and the base/quote Inco mints/accounts exist (see `tests/zivo-v1.ts` for the expected paths).
- Run: `anchor test --skip-local-validator --skip-deploy --provider.cluster devnet`
