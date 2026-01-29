# Shielded Operations Integration Guide

## Components Created

1. **InitializeShieldedPool** (`components/initialize-shielded-pool.tsx`)
   - Initialize shielded pool for a vault
   - Configure merkle tree depth
   - Shows vault information

2. **WrapAndShield** (`components/wrap-and-shield.tsx`)
   - Wrap SPL tokens and commit to shielded pool
   - Generate commitments
   - Save commitments to localStorage

3. **CommitmentHistory** (`components/commitment-history.tsx`)
   - View all commitments
   - Filter active/spent commitments
   - Copy commitment addresses
   - Mark commitments as spent

4. **ShieldedOperations** (`components/shielded-operations.tsx`)
   - Main container with tabs
   - Vault selector
   - Integrates all shielded components

## Integration into Main App

### Option 1: Add as New Page

Create `app/shielded/page.tsx`:

```typescript
"use client";

import { useState, useEffect } from "react";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import ShieldedOperations from "@/components/shielded-operations";
import { ZIVO_WRAP_PROGRAM_ID } from "@/utils/constants";
import bs58 from "bs58";

export default function ShieldedPage() {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const [vaults, setVaults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVaults();
  }, [anchorWallet]);

  const fetchVaults = async () => {
    if (!anchorWallet) return;

    setLoading(true);
    try {
      const VAULT_DISCRIMINATOR = [211, 8, 232, 43, 2, 152, 117, 119];
      const accounts = await connection.getProgramAccounts(ZIVO_WRAP_PROGRAM_ID, {
        filters: [
          {
            memcmp: {
              offset: 0,
              bytes: bs58.encode(Buffer.from(VAULT_DISCRIMINATOR)),
            },
          },
        ],
      });

      const vaultList = accounts.map(({ pubkey, account }) => {
        const data = account.data;
        let offset = 8;

        const authority = new PublicKey(data.slice(offset, offset + 32));
        offset += 32;
        const splTokenMint = new PublicKey(data.slice(offset, offset + 32));
        offset += 32;
        const incoTokenMint = new PublicKey(data.slice(offset, offset + 32));
        offset += 32;
        const vaultTokenAccount = new PublicKey(data.slice(offset, offset + 32));
        offset += 32;
        const isInitialized = data[offset] === 1;

        return {
          address: pubkey.toBase58(),
          authority: authority.toBase58(),
          splTokenMint: splTokenMint.toBase58(),
          incoTokenMint: incoTokenMint.toBase58(),
          vaultTokenAccount: vaultTokenAccount.toBase58(),
          isInitialized,
        };
      });

      setVaults(vaultList);
    } catch (err) {
      console.error("Error fetching vaults:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <ShieldedOperations vaults={vaults} loading={loading} />
    </div>
  );
}
```

### Option 2: Add as Tab in Existing Page

In your main page (e.g., `app/page.tsx`), add a new tab:

```typescript
const [activeTab, setActiveTab] = useState<"wrap" | "unwrap" | "vault" | "shielded">("wrap");

// In your tab navigation:
<button
  onClick={() => setActiveTab("shielded")}
  className={/* your tab styles */}
>
  🛡️ Shielded Operations
</button>

// In your content area:
{activeTab === "shielded" && (
  <ShieldedOperations vaults={vaults} loading={loadingVaults} />
)}
```

### Option 3: Add Navigation Link

In your navigation/sidebar, add:

```typescript
<Link href="/shielded">
  <div className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded">
    <span>🛡️</span>
    <span>Shielded Operations</span>
  </div>
</Link>
```

## Required Dependencies

Make sure these are in `package.json`:

```json
{
  "@solana/web3.js": "^1.87.0",
  "@solana/wallet-adapter-react": "^0.15.0",
  "@coral-xyz/anchor": "^0.29.0",
  "bs58": "^5.0.0"
}
```

## Environment Variables

Add to `.env.local` if needed:

```bash
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_LIGHT_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_KEY
```

## Usage Flow

1. **User connects wallet**
2. **Select vault** from dropdown
3. **Initialize Shielded Pool** (one-time per vault)
   - Choose merkle tree depth
   - Submit transaction
4. **Wrap & Shield tokens**
   - Enter amount
   - Submit transaction
   - Receive commitment address
5. **View commitments** in History tab
   - Copy commitment addresses
   - Mark as spent when used

## Next Steps (Phase 2)

To implement full shielded functionality, you'll need:

1. **Light Protocol Integration**
   - Use `@lightprotocol/stateless.js` for merkle tree operations
   - Generate proper commitments and proofs

2. **Noir Circuit Integration**
   - Generate ZK proofs for shielded transfers
   - Integrate with your existing Noir circuit

3. **Shielded Transfer Component**
   - Input: previous commitment
   - Generate proof of ownership
   - Create new commitment for recipient

4. **Unwrap from Note Component**
   - Decrypt note data
   - Generate proof
   - Unwrap to SPL tokens

## Notes

- All commitments are stored in browser localStorage
- Users should backup commitment addresses
- Proofs will need proper generation in production (currently mocked)
- Light Protocol trees need proper initialization via Light SDK
