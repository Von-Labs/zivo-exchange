# Zivo v1 Production Setup

This guide describes the on-chain setup and operational flow for the Zivo v1 orderbook program.

## Programs and roles

- Zivo Orderbook Program: the on-chain program in `programs/zivo-v1`.
- Inco Token Program: provides encrypted token accounts/mints.
- Inco Lightning Program: provides encrypted value operations.

Roles used in the steps below:
- Admin/Operator: deploys programs, initializes global state and vaults.
- Trader: places/cancels orders and owns deposit accounts.
- Validator/Matcher: submits matches and settles trades.

## One-time setup per deployment

1) Deploy programs
- Deploy the Zivo orderbook program and record its program id.

2) Derive PDAs and create Inco assets
- Derive the state PDA using seed `orderbook_state_v14`.
- Derive the vault authority PDA using seed `inco_vault_authority_v11`.
- Create Inco base/quote mints using the Inco Token program.
- Create Inco vault accounts owned by the vault authority PDA, one per mint.

3) Initialize Zivo state (one time)
- Call `initialize` with:
  - `state` = state PDA
  - `incoVaultAuthority` = vault authority PDA
  - `incoBaseVault`, `incoQuoteVault` = Inco vault accounts
  - `incoBaseMint`, `incoQuoteMint` = Inco mints
  - `payer` = admin/operator

This step must be called exactly once per deployment unless you deploy a new program id.

## Per-user setup (once per trader)

4) Initialize deposits
- Each trader must have two Inco accounts: base and quote, owned by the trader.
- Derive the deposit PDA using seed `deposit_v9` and the trader pubkey.
- Call `initialize_deposit` with:
  - `user` = trader (signer)
  - `deposit` = deposit PDA
  - `userBaseInco`, `userQuoteInco` = trader's Inco accounts
  - `state` = state PDA
  - `payer` = can be the trader or an operator paying fees

This step is called once per trader per deployment.

## Ongoing trading flow

5) Place orders (per order)
- Traders call `place_order` to place bids or asks.
- Each order moves encrypted escrow into the corresponding vault.

6) Match orders (per match)
- The matcher/validator calls `submit_match` to record a match.
- `match_record` PDA uses seeds: `"match_record"`, state PDA, and `match_id`.

7) Settle matches (per match)
- The matcher/validator calls `settle_match` to move escrowed funds to counterparties.
- This enforces that vaults and trader Inco accounts match the configured mints and owners.

8) Cancel orders (optional)
- Traders call `cancel_order` to release escrow for an open order.

## Matching record logic (how a match is defined)

- `submit_match` does not perform price/time matching on-chain. It simply records a `MatchRecord` with:
  - `match_id` (provided by the caller)
  - `bid_owner` and `ask_owner`
  - encrypted amount handles (`base_amount_handle`, `quote_amount_handle`)
- A match is “known” on-chain when the `match_record` PDA for a given `match_id` is created.
- `settle_match` uses that record to pay out from vaults, but it does not verify that:
  - the match corresponds to a specific on-chain order,
  - the amounts equal the escrowed order size, or
  - the price is valid.
- This means the matcher/validator is responsible for determining valid matches and amounts off-chain.

## Current capabilities and limits

- Single-slot orderbook per side: only one active bid (`best_bid`) and one active ask (`best_ask`) at a time.
- No on-chain price-time priority or depth; there is no queue or multiple price levels.
- No partial fills or order resizing; orders are all-or-nothing at the program level.
- Matching is external: `submit_match` records a match, and `settle_match` executes transfers using provided ciphertext.
- Cancel only applies to the active best slot and requires matching `client_order_id` and owner.

## Notes

- `reset_state` is intended for tests only; avoid using it in production.
- If you change PDA seed versions, you must redeploy the program and reinitialize state.
- Ensure Inco accounts/mints are created and owned as expected before calling `initialize`.
