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
#[derive(Default)]
pub struct Order {
    pub owner: Pubkey,
    pub side: u8,
    pub is_open: u8,
    pub _padding: [u8; 6],
    pub price: u64,
    pub seq: u64,
    pub remaining_handle: u128,
    pub bump: u8,
    pub _reserved: [u8; 7],
}

impl Order {
    pub const LEN: usize = 32 + 1 + 1 + 6 + 8 + 8 + 16 + 1 + 7;
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
