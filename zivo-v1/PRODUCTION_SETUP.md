# Zivo v1 Production Setup

This guide focuses on production deployment and how the relayer + web UI should integrate with the on-chain orderbook.

## Programs and roles

- Zivo Orderbook Program: `programs/zivo-v1` (Anchor).
- Inco Token Program: encrypted balances + transfers.
- Inco Lightning Program: encrypted handles and ops.

Roles:
- Admin/Operator: deploys programs, initializes market state and vaults.
- Relayer/Matcher (Admin signer): selects maker orders off-chain and submits `match_order`.
- Trader: places/cancels/close orders and owns Inco accounts.

## One-time setup per deployment

1) Deploy programs
- Deploy Inco programs if not already on the target cluster.
- Deploy the Zivo orderbook program and record its program id.

2) Derive PDAs and create Inco assets (per market)
- Market (state) PDA: seeds `orderbook_market_v1` + base mint + quote mint.
- Vault authority PDA: seeds `inco_vault_authority_v12` + market PDA.
- Create Inco base/quote mints using the Inco Token program.
- Create Inco vault accounts (one per mint) owned by the vault authority PDA.

3) Initialize Zivo market
Call `initialize(require_attestation)` with:
- `state` = market PDA (base+quote derived)
- `incoVaultAuthority` = vault authority PDA
- `incoBaseVault`, `incoQuoteVault` = Inco vault accounts
- `incoBaseMint`, `incoQuoteMint` = Inco mints
- `admin` = relayer wallet (matcher authority)
- `payer` = operator wallet

Use `require_attestation = true` in production to enforce encrypted checks via covalidator signatures.

Repeat steps 2–3 for each new market (each base/quote pair gets its own market PDA and vaults).

## Per-user setup (once per trader)

4) Initialize deposits (per market)
Each trader needs two Inco accounts (base + quote) owned by the trader.
Call `initialize_deposit` with:
- `user` (signer)
- `deposit` PDA: seeds `deposit_v9` + market PDA + user pubkey
- `userBaseInco`, `userQuoteInco`
- `state` (market PDA)
- `payer`

## Trading flow (production)

5) Place orders (from UI)
The web UI should call `place_order(side, price, size_ciphertext, input_type, escrow_ciphertext, escrow_input_type)`.
- Price is public (u64).
- Size is encrypted and stored as `remaining_handle` on the order.
- Escrow ciphertext moves funds into the vault (base for asks, quote for bids).
- A new `Order` PDA is created: `order_v1` + state + owner + seq.

6) Match orders (relayer)
The relayer service:
- Reads open orders from chain or its indexer.
- Sorts by best price + FIFO (seq) to select a maker order.
- Builds two transactions: `place_order` and `match_order` so the **taker** signs **once**.

Batch-sign UX note:
- If the wallet supports `signAllTransactions`, the UI can prompt the **taker** once to sign both `place_order` and `match_order` transactions.
- The relayer then co-signs `match_order` and submits both transactions sequentially.

`match_order` inputs:
- `taker_side` (0=bid, 1=ask)
- `taker_price` (must equal maker price)
- `taker_req_base_ciphertext` (requested base amount)
- `fill_base_ciphertext`, `fill_quote_ciphertext` (actual filled amounts)
- `input_type`

On-chain validations:
- Matcher authority == `state.admin`.
- Order is open, side mismatch, price match.
- Encrypted math: `actual = min(requested, remaining)`.
- When `require_attestation = true`, the program verifies covalidator signatures for the encrypted checks.
- Transfers:
  - Maker escrow → taker (from vault)
  - Taker payment → maker (direct transfer)

1) Cancel order (trader)
Call `cancel_order(remaining_ciphertext, input_type)`.
- Returns remaining escrow to the trader.
- Requires ciphertext representing the current encrypted remaining amount.

1) Close order (trader)
Call `close_order` after remaining reaches zero.
- If `require_attestation = true`, the program verifies an attested zero check.

## Integration notes for zivo-web

- Use the relayer wallet as the matcher/admin signer for `match_order`.
- The UI can place orders and sign as taker for matches.
- For production, the relayer must attach covalidator signature instructions to match/close transactions.

## Current capabilities / limits

- Public price, confidential size/remaining amount.
- Partial fills supported.
- Matching is off-chain selection + on-chain enforcement.
- Attestation required in production for encrypted checks.
- No on-chain price-time queue; FIFO is handled by the relayer.

## Notes

- `reset_state` and `bump_order_seq` are test helpers; avoid in production.
- If PDA seeds or account layouts change, redeploy and reinitialize state.
