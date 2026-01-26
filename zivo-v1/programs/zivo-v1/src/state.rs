use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct OrderbookState {
    pub order_seq: u64,
    pub bid_count: u64,
    pub ask_count: u64,
    pub best_bid: OrderSlot,
    pub best_ask: OrderSlot,
    pub last_match_handle: u128,
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
        + 8
        + 8
        + 8
        + (OrderSlot::LEN * 2)
        + 16
        + (32 * 5)
        + 8;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default)]
pub struct OrderSlot {
    pub owner: Pubkey,
    pub price_handle: u128,
    pub qty_handle: u128,
    pub client_order_id: u64,
    pub escrow_base_amount: u64,
    pub escrow_quote_amount: u64,
    pub is_active: u8,
    pub _padding: [u8; 7],
}

impl OrderSlot {
    pub const LEN: usize = 32 + 16 + 16 + 8 + 8 + 8 + 1 + 7;

    pub fn new(
        owner: Pubkey,
        price_handle: u128,
        qty_handle: u128,
        client_order_id: u64,
        escrow_base_amount: u64,
        escrow_quote_amount: u64,
    ) -> Self {
        Self {
            owner,
            price_handle,
            qty_handle,
            client_order_id,
            escrow_base_amount,
            escrow_quote_amount,
            is_active: 1,
            _padding: [0u8; 7],
        }
    }
}

#[account]
#[derive(Default)]
pub struct MatchRecord {
    pub match_id: u64,
    pub bid_owner: Pubkey,
    pub ask_owner: Pubkey,
    pub base_amount_handle: u128,
    pub quote_amount_handle: u128,
    pub status: u8,
    pub validator: Pubkey,
    pub _padding: [u8; 7],
}

impl MatchRecord {
    pub const LEN: usize = 8 + 32 + 32 + 16 + 16 + 1 + 32 + 7;
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
