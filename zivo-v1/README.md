# Zivo v1

Zivo is an early-stage, on-chain private orderbook prototype on Solana. The goal is to keep order details encrypted (price/qty) while still allowing on-chain matching logic via Inco Lightning.

This repo currently contains a minimal Anchor program (`programs/zivo-v1`) and a devnet test that encrypts order values with the Inco SDK, stores handles on-chain, and settles a simple base/quote match via Inco-token vault escrows.

## Status

- Encrypted order values are created via Inco on-chain handles.
- State stores only opaque handles (not plaintext).
- Matching logic is minimal (single best bid/ask, equality-only).
- Settlement is prototype-level (base/quote escrowed in vaults).

## Prerequisites

- Solana CLI (devnet config)
- Anchor CLI
- Node.js + Yarn
- Rust toolchain

Optional but required for encrypted tests:
- Inco SDK: `@inco/solana-sdk`

## Project Layout

- `programs/zivo-v1`: Anchor program
- `tests/zivo-v1.ts`: Anchor tests (devnet)
- `docs/magicblock-inco-architecture.md`: Flow notes (Inco, single-program setup)
- `Anchor.toml`: Cluster + program config

## Quickstart

Install dependencies:

```bash
yarn install
```

Build the program:

```bash
anchor build
```

## Devnet Flow

1) Deploy (if needed):

```bash
anchor deploy --provider.cluster devnet
```

2) Run tests on devnet (no local validator):

```bash
anchor test --skip-local-validator --skip-deploy --provider.cluster devnet
```

The test logs include:
- RPC endpoint
- Program ID
- Orderbook state PDA
- Inco program availability
- Ciphertext sizes
- Stored handle values
- Explorer links for transactions

## Zivo Private Orderbook

### Key Terms

- Orderbook: list of buy (bid) and sell (ask) orders.
- Bid: buy order (price + quantity).
- Ask: sell order (price + quantity).
- Ciphertext: encrypted bytes produced off-chain by Inco SDK.
- Handle: an on-chain opaque reference to an encrypted value.
- Matching: deciding when a bid and ask trade.

### Example Test Walkthrough

Run the devnet test (see Quickstart). Logs show PDAs, ciphertext sizes, and explorer links for each txn.

### Privacy Note (Short)

- Order data is encrypted (price/qty handles). Settlement uses Inco encrypted token CPIs, so amounts are opaque in state but tx meta still shows accounts touched.
- Private execution is not implemented; settlement remains on L1 with encrypted Inco transfers.

### Current Flow (What Happens Today)

1) Client encrypts `price` and `qty` using Inco SDK (off-chain).
2) Client sends ciphertext to `place_order` plus escrow amounts.
3) Program calls Inco `new_euint128` to create handles on-chain.
4) Program stores handles in state (no plaintext stored).
5) Program escrows base or quote tokens into vaults.
6) Minimal matching uses Inco equality on handles, then settles from vaults.

### What Is Done

- [x] Anchor program structure
- [x] Inco handle creation on-chain (`new_euint128`)
- [x] Store encrypted handles in state
- [x] Devnet tests with real encryption
- [x] Prototype base/quote escrow + settlement

### What Is Not Done Yet

- [ ] Multi-order orderbook (levels / depth)
- [ ] Encrypted ordering (beyond equality)
- [ ] Allow/decrypt flow for authorized viewers
- [ ] Robust error handling/invariants

## Next Steps

1) Keep L1 Inco settlement green on devnet (current tests).
2) Add allow/decrypt flows for balances after settlement.
3) Expand matching to multi-order depth with encrypted comparisons.
