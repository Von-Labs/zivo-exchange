# Zivo Wrap - SPL Token to Inco Token Wrapper

A Solana program that wraps SPL tokens (like USDC) into encrypted Inco tokens using Fully Homomorphic Encryption (FHE).

## Features

- **Wrap**: Convert SPL tokens to encrypted Inco tokens with private balances
- **Unwrap**: Convert encrypted Inco tokens back to SPL tokens
- **1:1 Ratio**: Guaranteed by encrypted operations
- **Secure Vault**: SPL tokens are safely locked in vault PDA
- **Shielded Path (Optional)**: Light Protocol + Noir proofs for unlinkable transfers (additive, not replacing classic wrap/unwrap)

## Installation

### 1. Clone with Submodules

```bash
# Clone the repository with submodules
git clone --recurse-submodules <your-repo-url>

# Or if already cloned, initialize submodules
git submodule update --init --recursive
```

### 2. Install Dependencies

```bash
# Install Rust dependencies (handled by Cargo)
cd zivo-wrap

# Install Node.js dependencies
yarn install
# or
npm install
```

### 3. Required TypeScript Libraries

The following packages are needed for testing:

```json
{
  "@coral-xyz/anchor": "^0.31.1",
  "@solana/web3.js": "^1.95.8",
  "@solana/spl-token": "^0.4.9",
  "@inco/solana-sdk": "^0.0.2",
  "tweetnacl": "^1.0.3"
}
```

### 4. Inco Token Program

The Inco Token Program is already deployed on Solana Devnet:
- **Program ID**: `4cyJHzecVWuU2xux6bCAPAhALKQT8woBh4Vx3AGEGe5N`
- **IDL File**: Included at `idl/inco_token.json`
- **Rust Crate**: Via git submodule at `../lightning-rod-solana`

The submodule is required for Rust program compilation (CPI types).

## Program Architecture

### Vault Structure
- Maps SPL token mint to Inco token mint
- Vault PDA acts as mint authority for Inco tokens
- Holds SPL tokens in a token account

### Instructions

1. **initialize_vault**: Creates vault mapping between SPL and Inco mints
2. **wrap_token**: Transfers SPL tokens to vault, mints encrypted Inco tokens
3. **unwrap_token**: Burns encrypted Inco tokens, returns SPL tokens

## Build & Test

### Build the Program

```bash
anchor build
```

### Run Tests

```bash
anchor test
```

## Usage Flow

### 1. Setup Phase

```typescript
// Create SPL token mint (e.g., mock USDC)
const splMint = await createMint(connection, payer, authority, null, 9);

// Create Inco token mint
const incoMint = Keypair.generate();
await incoTokenProgram.methods
  .initializeMint(9, authority, null)
  .accounts({ mint: incoMint.publicKey, ... })
  .rpc();

// Derive vault PDA
const [vaultPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("vault"), splMint.toBuffer(), incoMint.publicKey.toBuffer()],
  program.programId
);

// Create vault token account
const vaultTokenAccount = await createAccount(
  connection,
  payer,
  splMint,
  vaultPda
);
```

### 2. Initialize Vault

```typescript
await program.methods
  .initializeVault()
  .accounts({
    vault: vaultPda,
    splTokenMint: splMint,
    incoTokenMint: incoMint.publicKey,
    vaultTokenAccount: vaultTokenAccount,
    authority: authority.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();

// Transfer mint authority to vault
await incoTokenProgram.methods
  .setMintAuthority(vaultPda)
  .accounts({
    mint: incoMint.publicKey,
    currentAuthority: authority.publicKey,
  })
  .rpc();
```

### 3. Wrap Tokens

```typescript
const amount = 100_000_000_000; // 100 tokens

await program.methods
  .wrapToken(new anchor.BN(amount))
  .accounts({
    vault: vaultPda,
    splTokenMint: splMint,
    incoTokenMint: incoMint.publicKey,
    userSplTokenAccount: userSplAccount,
    vaultTokenAccount: vaultTokenAccount,
    userIncoTokenAccount: userIncoAccount,
    user: user.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
  })
  .rpc();
```

### 4. Unwrap Tokens

```typescript
const unwrapAmount = 50_000_000_000; // 50 tokens
const encryptedHex = await encryptValue(BigInt(unwrapAmount));

await program.methods
  .unwrapToken(hexToBuffer(encryptedHex), 0, new anchor.BN(unwrapAmount))
  .accounts({
    vault: vaultPda,
    splTokenMint: splMint,
    incoTokenMint: incoMint.publicKey,
    userSplTokenAccount: userSplAccount,
    vaultTokenAccount: vaultTokenAccount,
    userIncoTokenAccount: userIncoAccount,
    user: user.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
  })
  .rpc();
```

## Shielded Wrap (Noir + Light Protocol)

This adds a shielded path that uses:
- **Noir** to prove note ownership and action consistency.
- **Light Protocol** to store commitments/nullifiers and fetch validity proofs.

For the full architecture, payload format, and step-by-step flow, see:
- `docs/shielded-wrap-inco-tokens.md`

### Support Status
**Classic wrap/unwrap is still supported** and remains the default path for minting/burning Inco balances.  
The shielded path is additive and can be used in parallel for privacy-focused transfers.

### Flow (Shielded)

```mermaid
sequenceDiagram
  participant U as User
  participant Z as Zivo Wrap Program
  participant L as Light System Program
  participant V as Noir Verifier
  participant S as SPL Token Program

  U->>Z: wrap_and_commit(note, commitment)
  Z->>S: transfer SPL to vault
  Z->>L: CPI insert commitment (Light proof)

  U->>Z: shielded_transfer(nullifier, new_commitments, proof)
  Z->>V: verify Noir proof
  Z->>L: CPI nullify + insert new commitments

  U->>Z: unwrap_from_note(nullifier, proof)
  Z->>V: verify Noir proof
  Z->>L: CPI nullify note
  Z->>S: transfer SPL from vault to user
```

### Current Guarantees vs Pending Bindings

**Current guarantees**
- Light commitments and nullifiers are inserted and proven with validity proofs.
- Noir proof enforces note fields (owner, mint, amount, blinding) and nullifier binding.
- SPL transfers are gated by proof verification.

**Pending bindings (MVP gaps)**
- The Light **leaf hash** is not bound to the note hash on-chain.
- The shielded path does not update **Inco confidential balances** yet.
- Full asset consistency between classic wrap/unwrap and shielded notes is not enforced.

### Notes
- A new verifier program must be built and deployed whenever the circuit changes.
- The shielded tests use on-chain Light proofs + Noir proofs generated via `nargo`/`sunspot`.

## Security Considerations

- Vault PDA is the only authority that can mint/burn Inco tokens
- All balances are encrypted using FHE
- SPL tokens are safely locked in vault token account
- 1:1 ratio maintained through encrypted operations

## Program IDs

- **Inco Lightning Program**: `5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj`
- **Inco Token Program**: `4cyJHzecVWuU2xux6bCAPAhALKQT8woBh4Vx3AGEGe5N`
- **Zivo Wrap Program**: `22XN9yJRWQv5hAeu3PZCoQvezV82s6LHxxHWk6YjhEH6`
- **ZK Verifier Program**: `EM14vFSXgzAcF3unJgYwXd3QVAWcPhmrNm77dsw1ekg3`

## License

ISC
