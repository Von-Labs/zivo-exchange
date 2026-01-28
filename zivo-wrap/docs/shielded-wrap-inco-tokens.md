# Shielded Inco Wrap (Light Protocol + Noir)

## Goals
- Hide transfer amounts (already handled by Inco) and unlink sender/receiver by moving transfers into a shielded pool.
- Leverage Light Protocol for rent-free storage of commitments/nullifiers and managed Merkle trees.
- Use Noir to prove: ownership of a note, correctness of nullifier, and value conservation.

## Current State (zivo-wrap)
- Program provides `initialize_vault`, `wrap_token`, `grant_allowance`, `unwrap_token`.
- Wrap/unwrap uses Inco Token + Inco Lightning CPI with ciphertext-based mint/burn.
- All flows are account-addressed (wallets are visible on-chain).

## Architecture (Shielded Path)
### Components
- **Zivo Wrap Program (shielded extensions)**
  - Manages note commitments and nullifiers.
  - CPI into Light System Program to append commitments + record nullifiers.
  - CPI into Inco Token program on wrap/unwrap boundaries (classic path still supported).

- **Light Protocol**
  - State tree for commitments and nullifier queue (rent-free, maintained by Forester).
  - Validity proofs from Light RPC to prove inclusion/non-existence of compressed accounts.

- **Noir Circuit**
  - Inputs: note fields (owner, mint, amount, blinding), Merkle path, nullifier secret.
  - Outputs: nullifier hash and public note fields.
  - Constraints: ownership, note hash binding, nullifier binding, Merkle root match.

### Note Model (current circuit)
Fields are mapped to BN254 field elements and hashed with Poseidon **hash_2 chaining**:

```
owner_field   = hash_to_field(owner_pubkey)
mint_field    = hash_to_field(mint_pubkey)
amount_field  = amount
blinding      = random field element

note_hash     = H2( H2(owner_field, mint_field), H2(amount_field, blinding) )
nullifier     = H2(note_hash, nullifier_secret)
```

**Note**: `hash_to_field` uses `hashvToBn254FieldSizeBe` to keep values within the BN254 modulus.

### Flows
1. **Wrap (SPL -> Shielded Note + Inco mint)**
   - Transfer SPL to vault.
   - Mint Inco tokens to the user (wallet UX, classic path).
   - Create a new commitment (note) with value; append to Light state tree.

2. **Shielded Transfer (Note -> Note)**
   - Submit Noir proof for input note + output notes.
   - On-chain: verify proof, append new commitments, push nullifier.

3. **Unwrap (Shielded Note -> SPL + Inco burn)**
   - Prove ownership of note and spend it (nullifier).
   - Transfer SPL from vault to recipient.

## Light Protocol Integration Points
- Use Light `validity proof` flow to create/update compressed accounts.
- Store nullifiers as compressed accounts (no rent).
- Append commitments to state tree using Light System Program CPI.
- Depend on Forester to roll queues into trees; no custom indexer required.

### Remaining Accounts Layout (Light CPI)
When calling `wrap_and_commit`, `shielded_transfer`, or `unwrap_from_note`, the program expects
`remaining_accounts` to be packed using `PackedAccounts` (v2) from `@lightprotocol/stateless.js`.
At minimum, include:
- Light system accounts from `SystemAccountMetaConfig.new(programId)` via `addSystemAccountsV2`.
- Address tree + address queue accounts (from `PackedAddressTreeInfo` indices).
- State tree queue account (output state tree index).

This matches the pattern in Light `program-examples/basic-operations/anchor/create-nullifier`.

## Proof Payload (Noir / Sunspot)
The on-chain verifier expects a single byte blob:

```
proof_payload = [groth16_proof_bytes | public_witness_bytes]
```

Public inputs (current circuit) are:
- `root` (Light state tree root)
- `nullifier`
- `recipient`
- `amount`
- `mint`
- `commitment`
- `leaf` (Light compressed account hash)

These are produced by `nargo execute` (witness) + `sunspot prove` (proof).

## Verifier Build + Deploy (Noir / Sunspot)
We use the local circuit in `zivo-wrap/noir_circuit` (package: `zivo_wrap_shielded`).
For devnet:

1) Compile the circuit:
```bash
cd zivo-wrap/noir_circuit
nargo compile
```

2) Use Sunspot to setup/prove/deploy:
```bash
sunspot compile target/zivo_wrap_shielded.json
sunspot setup target/zivo_wrap_shielded.ccs
sunspot prove target/zivo_wrap_shielded.json target/zivo_wrap_shielded.gz target/zivo_wrap_shielded.ccs target/zivo_wrap_shielded.pk
sunspot deploy target/zivo_wrap_shielded.vk
```

3) Deploy the generated verifier program to devnet:
```bash
solana program deploy path/to/verifier.so --url devnet
```

4) Use the verifier program ID in tests:
```bash
export ZK_VERIFIER_PROGRAM_ID=<verifier_program_id>
export ZK_PROOF_DATA=<base64_encoded_proof_plus_public_inputs>
```

The proof payload format should match the Sunspot verifier output (proof bytes + public inputs).

## Full Devnet Flow (zivo-wrap)
1) Build + deploy `zivo-wrap` program:
```bash
cd zivo-wrap
anchor build
solana program deploy target/deploy/zivo_wrap.so --url devnet
```

2) Build + deploy verifier (local circuit):
```bash
cd zivo-wrap
yarn noir:build
```
Note: `yarn noir:build` compiles and deploys the verifier. It does not run `nargo execute` or `sunspot prove` unless you set `NOIR_RUN_PROVE=1`.
Then deploy the `.so` output:
```bash
solana program deploy path/to/verifier.so --url devnet
```

3) Generate ZK proof payload (base64) for tests:
```bash
cd zivo-wrap
export LIGHT_RPC_URL=https://api.devnet.solana.com
export LIGHT_COMPRESSION_URL=<photon_or_compression_rpc_url>
export LIGHT_PROVER_URL=<photon_or_prover_url>
ZK_ROOT=0x0 \
ZK_NULLIFIER=0x0 \
ZK_RECIPIENT=0x0 \
ZK_AMOUNT=1 \
ZK_LEAF=0x0 \
ZK_INDEX=0 \
ZK_SIBLINGS=0x0 \
ZK_CIRCUIT_DIR=./noir_circuit \
ZK_CIRCUIT_NAME=zivo_wrap_shielded \
yarn zk:prove > /tmp/zk_proof_payload.b64
```

For a real proof, set `ZK_ROOT`, `ZK_LEAF`, `ZK_INDEX`, and `ZK_SIBLINGS` from Light
(`getCompressedAccount` + `getCompressedAccountProof`). The tests can do this automatically when
`ZK_PROOF_GENERATE=1`.

4) Run tests on devnet:
```bash
export ZK_VERIFIER_PROGRAM_ID=<verifier_program_id>
export ZK_PROOF_DATA=$(cat /tmp/zk_proof_payload.b64)
cd zivo-wrap
yarn run ts-mocha -p ./tsconfig.json -t 1000000 'tests/**/*.ts'
```

Note: For hackathon MVP, proof inputs can be dummy values; the program only checks verifier success and nullifier uniqueness. Later we should bind the proof root to the Light tree root.

### Env Vars (Tests)
- `LIGHT_RPC_URL` (default: devnet)
- `LIGHT_COMPRESSION_URL` and `LIGHT_PROVER_URL` (Photon endpoints)
- `ZK_VERIFIER_PROGRAM_ID` (deployed verifier)
- `ZK_PROOF_DATA` (base64 of proof+public inputs) or `ZK_PROOF_GENERATE=1`
- `ZK_*` inputs used by `yarn zk:prove` or test-time proof generation
- `ZK_CIRCUIT_NAME` defaults to `zivo_wrap_shielded`

## Current Guarantees vs Pending Bindings

**Current guarantees**
- Light commitments and nullifiers are inserted and proven with validity proofs.
- Noir proof enforces note fields (owner, mint, amount, blinding) and nullifier binding.
- SPL transfers are gated by proof verification.

**Pending bindings (MVP gaps)**
- The Light **leaf hash** is not bound to the note hash on-chain.
- The shielded path does not update **Inco confidential balances** yet.
- Full asset consistency between classic wrap/unwrap and shielded notes is not enforced.
