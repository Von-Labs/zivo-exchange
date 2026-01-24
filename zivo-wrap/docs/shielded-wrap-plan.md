# Shielded Inco Wrap Plan (Light Protocol + Noir)

## Goals
- Hide transfer amounts (already handled by Inco) and unlink sender/receiver by moving transfers into a shielded pool.
- Leverage Light Protocol for rent-free storage of commitments/nullifiers and managed Merkle trees.
- Use Noir to prove: ownership of a note, correctness of nullifier, and value conservation.

## Current State (zivo-wrap)
- Program provides `initialize_vault`, `wrap_token`, `grant_allowance`, `unwrap_token`.
- Wrap/unwrap uses Inco Token + Inco Lightning CPI with ciphertext-based mint/burn.
- All flows are account-addressed (wallets are visible on-chain).

## Target Architecture
### Components
- **Shielded Pool Program (zivo-wrap upgrade)**
  - Manages UTXO-like notes (commitments) and nullifiers.
  - CPI into Light System Program to append commitments + record nullifiers.
  - CPI into Inco Token program to mint/burn on wrap/unwrap boundaries.

- **Light Protocol**
  - State tree for commitments and nullifier queue (rent-free, maintained by Forester).
  - Validity proofs from Light RPC to prove inclusion/non-existence of compressed accounts.

- **Noir Circuit**
  - Inputs: spend keys, Merkle path, note data (value, blinding, owner pubkey), nullifier salt, output note data.
  - Outputs: nullifier hash, new commitment hashes, public value sum, optional fee.
  - Constraints: ownership, inclusion, nullifier uniqueness, value conservation.

### Note Model
- Commitment = H(owner_pubkey || value || blinding || asset_id)
- Nullifier = H(spend_key || note_commitment || salt)
- Optional: encrypted note payload for receiver (stealth).

### Flows
1. **Wrap (SPL -> Shielded Note + Inco mint)**
   - Transfer SPL to vault.
   - Create a new commitment (note) with value; append to Light state tree.
   - Optionally mint Inco tokens only on unwrap (preferred) to keep anonymity set.

2. **Shielded Transfer (Note -> Note)**
   - Submit Noir proof for input note + two output notes.
   - On-chain: verify proof (or verify via Light verifier), append new commitments, push nullifier.

3. **Unwrap (Shielded Note -> SPL + Inco burn)**
   - Prove ownership of note and spend it (nullifier).
   - Burn Inco ciphertext (if minted on wrap) or skip if only mint on unwrap.
   - Transfer SPL from vault to recipient.

## Light Protocol Integration Points
- Use Light `validity proof` flow to create/update compressed accounts.
- Store nullifiers as compressed accounts (no rent).
- Append commitments to state tree using Light System Program CPI.
- Depend on Forester to roll queues into trees; no custom indexer required.

## Phased Implementation Plan

### Phase 1: Design + Proof-of-Concept
- Document exact note fields and hashing scheme.
- Choose the proof system supported by Solana verifier (Groth16/Plonk).
- Build a tiny Noir circuit: 1-input/1-output spend with nullifier.
- Confirm on-chain verifier cost with compute budget.

### Phase 2: Program Integration
- Add new program state for shielded pool config (tree pubkeys, asset id, vault).
- Add instructions:
  - `init_shielded_pool`
  - `wrap_and_commit`
  - `shielded_transfer`
  - `unwrap_from_note`
- Wire Light CPI for append/nullifier using packed accounts.
- Keep backward-compatible wrap/unwrap for testing.

### Phase 3: Client + SDK
- Client helpers to:
  - derive commitments and nullifiers
  - request validity proofs from Light RPC
  - build Noir proofs and submit transactions
- Minimal note scanning helper (local store + optional indexer fallback).

### Phase 4: Tests
- Program tests for:
  - wrap creates commitment
  - shielded transfer consumes note and creates outputs
  - double-spend fails via nullifier
  - unwrap releases SPL and/or burns Inco
- End-to-end test with Light local setup + Forester.

### Phase 5: Docs + README
- Add architecture diagram + sequence steps.
- Provide setup steps for local Light dev env and Noir proving.
- Provide a minimal CLI flow: wrap -> shielded transfer -> unwrap.

## Open Decisions
- Mint Inco tokens on wrap vs only on unwrap.
- Commitment hash function (match Light or custom Poseidon params).
- Whether to store encrypted note payloads on-chain or via off-chain relay.
- Required anonymity set size for production.

## Deliverables
- `docs/shielded-wrap-plan.md` (this file)
- Updated `README.md` with shielded flow overview.
- New tests under `tests/` for shielded flows.
- Noir circuit sources in a new `circuits/` folder (or within `noir-examples`).

## Success Criteria
- Demonstrable unlinking of sender/receiver at the on-chain address level.
- Double-spend prevention via nullifiers in Light queue.
- No rent-exempt storage for notes/nullifiers.

