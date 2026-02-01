# Zivo Exchange

A privacy-preserving decentralized exchange (DEX) on Solana that combines Fully Homomorphic Encryption (FHE) with Zero-Knowledge proofs for confidential trading.

## Overview

Zivo Exchange enables private trading of tokens on Solana using:
- **Inco Network's FHE** for encrypted balances and confidential transfers
- **Light Protocol** for compressed state and validity proofs
- **Noir ZK proofs** for shielded transaction privacy
- **Solana's high-performance** blockchain for fast settlement

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend Layer                           │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                        Zivo Web                           │  │
│  │                    Next.js Frontend                       │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
           │                                    │
           │ Place Orders                       │ Wrap/Unwrap
           ▼                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Solana Programs                           │
│  ┌──────────────────────┐        ┌──────────────────────────┐   │
│  │       Zivo V1        │        │        Zivo Wrap         │   │
│  │    Orderbook DEX     │        │      Token Bridge        │   │
│  └──────────────────────┘        └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
        │            │                    │              │
        │            │                    │              │
  Match │     FHE    │              Mint/ │              │ Commitments
  Orders│  Transfers │              Burn  │              │
        │            │                    │              │
        ▼            ▼                    ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Infrastructure Layer                        │
│  ┌──────────────────────┐        ┌──────────────────────────┐   │
│  │      Inco Token      │        │     Light Protocol       │   │
│  │    FHE Encryption    │        │ ZK Proofs & Compression  │   │
│  └──────────────────────┘        └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Repository Structure

```
zivo-exchange/
├── zivo-web/              # Next.js frontend application
│   ├── app/               # Next.js 13+ app directory
│   ├── components/        # React components
│   ├── utils/             # Utility functions and constants
│   ├── wallet/            # Wallet integration
│   └── idl/               # Anchor IDL files
│
├── zivo-wrap/             # SPL ↔ Inco token wrapper program
│   ├── programs/          # Anchor program source
│   ├── tests/             # Integration tests
│   ├── circuits/          # Noir ZK circuits
│   └── docs/              # Technical documentation
│
├── zivo-v1/               # Orderbook program (Inco FHE)
│   ├── programs/          # Anchor program source
│   ├── tests/             # Integration tests
│   └── scripts/           # Deployment scripts
│
└── lightning-rod-solana/  # Inco Token program (submodule)
    └── programs/inco-token/
```

## Key Components

### 1. **Zivo Web** (Frontend)
Next.js application providing the user interface for:
- Wallet connection (Phantom, Solflare, etc.)
- Token wrapping/unwrapping
- Shielded pool management
- Order placement and matching
- Balance viewing (encrypted)

**Tech Stack:**
- Next.js 14
- TypeScript
- Tailwind CSS
- Anchor (@coral-xyz/anchor)
- Solana Web3.js

### 2. **Zivo Wrap** (Token Bridge)
Solana program that bridges SPL tokens to encrypted Inco tokens:
- **Wrap**: Convert SPL → Inco (FHE encrypted)
- **Unwrap**: Convert Inco → SPL (decrypt and transfer)
- **Shielded Path**: Use Noir proofs + Light Protocol for unlinkable transfers
- **1:1 Ratio**: Guaranteed through PDA vaults

**Features:**
- Classic wrap/unwrap with FHE
- Shielded wrap/unwrap with ZK proofs
- Commitment/nullifier tracking via Light Protocol
- Vault management for SPL token custody

### 3. **Zivo V1** (Orderbook)
Encrypted orderbook DEX using Inco's FHE:
- Place limit orders with encrypted prices/amounts
- Match orders on-chain without revealing details
- Settlement with encrypted Inco token transfers
- MEV protection through encryption

**Order Types:**
- Limit orders (buy/sell)
- Market orders (not yet implemented)

### 4. **Inco Token** (FHE Token Standard)
Solana token standard with Fully Homomorphic Encryption:
- Encrypted balances
- Encrypted transfers
- Homomorphic operations (add, subtract)
- Decryption only by owner

## Getting Started

### Prerequisites

- Node.js 18+
- Rust 1.75+
- Solana CLI 1.18+
- Anchor 0.31+
- Yarn or npm

### Installation

```bash
# Clone repository with submodules
git clone --recurse-submodules https://github.com/Von-Labs/zivo-exchange.git
cd zivo-exchange

# Install frontend dependencies
cd zivo-web
yarn install

# Install Anchor program dependencies
cd ../zivo-wrap
yarn install

cd ../zivo-v1
yarn install
```

### Build Programs

```bash
# Build zivo-wrap
cd zivo-wrap
anchor build

# Build zivo-v1 orderbook
cd ../zivo-v1
anchor build
```

### Run Frontend

```bash
cd zivo-web
yarn dev
# Open http://localhost:3000
```

### Environment Variables

Create `.env.local` in `zivo-web/`:

```bash
# Helius API Key (RPC endpoint)
NEXT_PUBLIC_HELIUS_API_KEY=your_helius_api_key

# Program IDs (Devnet)
NEXT_PUBLIC_ZK_VERIFIER_PROGRAM_ID=BsDrfmK14jyHR4q1PufBUrjnztoDB4u9ieXZyF8CKbP7
NEXT_PUBLIC_LIGHT_SYSTEM_PROGRAM_ID=H5sFv8VwWmjxHYS2GB4fTDsK7uTtnRT4WiixtHrET3bN

# Admin Private Key (server-side only)
ADMIN_PRIVATE_KEY=your_admin_private_key

# Proof generation paths
GNARK_VERIFIER_BIN=/path/to/sunspot/gnark-solana/crates/verifier-bin
```

## Usage

### 1. Wrap SPL Tokens to Inco

```typescript
import { wrapToken } from '@/utils/wrap';

// Wrap 100 USDC to encrypted Inco USDC
await wrapToken({
  amount: 100_000_000, // 100 USDC (6 decimals)
  splMint: SPL_USDC_MINT,
  incoMint: INCO_USDC_MINT,
});
```

### 2. Unwrap Inco to SPL

```typescript
import { unwrapToken } from '@/utils/unwrap';

// Unwrap 50 Inco USDC back to SPL USDC
await unwrapToken({
  amount: 50_000_000,
  splMint: SPL_USDC_MINT,
  incoMint: INCO_USDC_MINT,
});
```

### 3. Place Order on Orderbook

```typescript
import { placeOrder } from '@/utils/orderbook';

// Place buy order for 10 tokens at price 100
await placeOrder({
  market: marketPubkey,
  side: 'buy',
  price: 100_000_000, // Encrypted
  amount: 10_000_000,  // Encrypted
});
```

### 4. Shielded Transfer (ZK Proof)

```typescript
import { shieldedTransfer } from '@/utils/shielded';

// Transfer with ZK proof for maximum privacy
await shieldedTransfer({
  recipient: recipientPubkey,
  amount: 25_000_000,
  commitment: noteCommitment,
  proof: zkProof,
});
```

## Program IDs (Devnet)

```
Inco Lightning Program:  5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj
Inco Token Program:      4cyJHzecVWuU2xux6bCAPAhALKQT8woBh4Vx3AGEGe5N
Zivo Wrap Program:       hcapJFTKYpxHPFjewhgQ12W7Wi41XnxAAiC8hwUQLzz
Zivo Orderbook Program:  <from idl.json>
ZK Verifier Program:     BsDrfmK14jyHR4q1PufBUrjnztoDB4u9ieXZyF8CKbP7
Light System Program:    H5sFv8VwWmjxHYS2GB4fTDsK7uTtnRT4WiixtHrET3bN
```

## Development

### Run Tests

```bash
# Test zivo-wrap
cd zivo-wrap
anchor test

# Test zivo-v1
cd zivo-v1
anchor test
```

### Deploy Programs

```bash
# Deploy to devnet
anchor deploy --provider.cluster devnet

# Deploy to mainnet (use with caution)
anchor deploy --provider.cluster mainnet-beta
```

## Security Features

### Encryption Layer (FHE)
- All balances encrypted using Fully Homomorphic Encryption
- Operations performed on encrypted data
- Only owner can decrypt their balance
- No plaintext amounts visible on-chain

### Privacy Layer (ZK Proofs)
- Noir circuits prove transaction validity
- Light Protocol stores commitments/nullifiers
- Unlinkable transfers between users
- Shielded transaction graph

### Vault Security
- SPL tokens locked in program-derived addresses (PDAs)
- Only vault PDA can mint/burn Inco tokens
- 1:1 backing ratio enforced
- No admin backdoors

## Known Limitations

### Current MVP Gaps
- Light leaf hash not bound to note hash on-chain
- Shielded path doesn't update Inco confidential balances yet
- Full asset consistency between classic and shielded paths not enforced
- Order matching algorithm is basic (first-come-first-served)

### Future Improvements
- Advanced order types (market, stop-loss)
- Cross-chain bridges
- Liquidity pools with FHE
- Mobile wallet support
- Enhanced ZK circuit optimizations

## Documentation

Detailed documentation for each component:
- [Zivo Wrap Documentation](./zivo-wrap/README.md)
- [Shielded Wrap Architecture](./zivo-wrap/docs/shielded-wrap-inco-tokens.md)
- [Orderbook Documentation](./zivo-v1/docs/orderbook-inco-architecture.md)

## Contributing

We welcome contributions! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Write tests
5. Submit a pull request

## Support

For questions or issues:
- Open an issue on GitHub

---

Built with ❤️ by Von Labs
