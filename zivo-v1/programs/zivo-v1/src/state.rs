use anchor_lang::prelude::*;

pub const MAX_ESCROW_CIPHERTEXT_LEN: usize = 512;

#[account]
#[derive(Default)]
pub struct OrderbookState {
    pub admin: Pubkey,
    pub order_seq: u64,
    pub require_attestation: u8,
    pub _reserved: [u8; 7],
    pub inco_base_mint: Pubkey,
    pub inco_quote_mint: Pubkey,
    pub inco_vault_authority: Pubkey,
    pub inco_base_vault: Pubkey,
    pub inco_quote_vault: Pubkey,
    pub _padding: [u8; 8],
}

impl OrderbookState {
    // 8 bytes account discriminator + fields
    pub const LEN: usize = 8
        + 32
        + 8
        + 1
        + 7
        + (32 * 5)
        + 8;
}

#[account]
pub struct Order {
    pub owner: Pubkey,
    pub side: u8,
    pub is_open: bool,
    pub is_filled: bool,
    pub is_claimed: bool,
    pub claim_input_type: u8,
    pub claim_plaintext_amount: u64,
    pub claim_ciphertext: Vec<u8>,
    pub _padding: [u8; 1],
    pub price: u64,
    pub seq: u64,
    pub remaining_handle: u128,
    pub bump: u8,
    pub _reserved: [u8; 7],
}

impl Order {
    pub const LEN: usize = 32
        + 1
        + 1
        + 1
        + 1
        + 1
        + 8
        + 4
        + MAX_ESCROW_CIPHERTEXT_LEN
        + 1
        + 8
        + 8
        + 16
        + 1
        + 7;
}

impl Default for Order {
    fn default() -> Self {
        Self {
            owner: Pubkey::default(),
            side: 0,
            is_open: false,
            is_filled: false,
            is_claimed: false,
            claim_input_type: 0,
            claim_plaintext_amount: 0,
            claim_ciphertext: Vec::new(),
            _padding: [0u8; 1],
            price: 0,
            seq: 0,
            remaining_handle: 0,
            bump: 0,
            _reserved: [0u8; 7],
        }
    }
}

#[account]
#[derive(Default)]
pub struct DepositAccount {
    pub user: Pubkey,
    pub base_inco_account: Pubkey,
    pub quote_inco_account: Pubkey,
    pub bump: u8,
    pub _padding: [u8; 7],
}

impl DepositAccount {
    pub const LEN: usize = 32 + 32 + 32 + 1 + 7;
}

#[account]
#[derive(Default)]
pub struct MatchAttestation {
    pub maker_is_zero_handle: u128,
    pub taker_is_filled_handle: u128,
    pub matches_actual_handle: u128,
    pub bump: u8,
    pub _padding: [u8; 7],
}

impl MatchAttestation {
    pub const LEN: usize = 16 + 16 + 16 + 1 + 7;
}
