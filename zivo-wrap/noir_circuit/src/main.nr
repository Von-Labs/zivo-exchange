use dep::poseidon::poseidon::bn254::hash_2 as poseidon_hash;

global TREE_DEPTH: u32 = 32;

fn poseidon_hash_2(left: Field, right: Field) -> Field {
    poseidon_hash([left, right])
}

fn compute_merkle_root<let N: u32>(leaf: Field, index: Field, siblings: [Field; N]) -> Field {
    let mut current = leaf;
    let path_bits: [u1; N] = index.to_le_bits();

    for i in 0..N {
        let sibling = siblings[i];
        let bit = path_bits[i];

        let (left, right) = if bit == 0 {
            (current, sibling)
        } else {
            (sibling, current)
        };

        current = poseidon_hash_2(left, right);
    }

    current
}

fn main(
    root: pub Field,
    nullifier: pub Field,
    recipient: pub Field,
    amount: pub u64,
    mint: pub Field,
    commitment: pub Field,
    leaf: pub Field,
    index: Field,
    siblings: [Field; TREE_DEPTH],
    owner: Field,
    blinding: Field,
    nullifier_secret: Field,
) {
    // 1. Merkle membership (leaf from Light compressed account hash)
    let calculated_root = compute_merkle_root(leaf, index, siblings);
    assert(root == calculated_root);

    // 2. Note structure + binding
    let owner_mint = poseidon_hash_2(owner, mint);
    let amount_blinding = poseidon_hash_2(amount as Field, blinding);
    let note_hash = poseidon_hash_2(owner_mint, amount_blinding);
    assert(commitment == note_hash);

    // 3. Action consistency
    assert(recipient == owner);
    assert(amount > 0);

    // 4. Nullifier bound to the same note
    let computed_nullifier = poseidon_hash_2(note_hash, nullifier_secret);
    assert(computed_nullifier == nullifier);
}

#[test]
fn test_shielded_pool() {
    let index = 0;
    let amount = 1000000; // 1M lamports
    let mut siblings = [0; TREE_DEPTH];
    let leaf = 1;
    let nullifier = 2;
    let root = compute_merkle_root(leaf, index, siblings);
    let recipient = 123; // dummy recipient hash
    let owner = 123;
    let mint = 456;
    let blinding = 789;
    let nullifier_secret = 42;
    let owner_mint = poseidon_hash_2(owner, mint);
    let amount_blinding = poseidon_hash_2(amount as Field, blinding);
    let commitment = poseidon_hash_2(owner_mint, amount_blinding);

    main(
        root,
        nullifier,
        recipient,
        amount,
        mint,
        commitment,
        leaf,
        index,
        siblings,
        owner,
        blinding,
        nullifier_secret,
    );
}
