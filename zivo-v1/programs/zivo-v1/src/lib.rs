use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

pub use instructions::*;

declare_id!("HmJaFzPNVVgmp9kghKZZJ82stGyEt7SZYYm2TBfLLA3L");

#[program]
pub mod zivo_orderbook_program {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, require_attestation: bool) -> Result<()> {
        instructions::initialize::handler(ctx, require_attestation)
    }

    pub fn initialize_deposit(ctx: Context<InitializeDeposit>) -> Result<()> {
        instructions::initialize_deposit::handler(ctx)
    }

    pub fn place_order(
        ctx: Context<PlaceOrder>,
        side: u8,
        price: u64,
        size_ciphertext: Vec<u8>,
        input_type: u8,
        escrow_ciphertext: Vec<u8>,
        escrow_input_type: u8,
    ) -> Result<()> {
        instructions::place_order::handler(
            ctx,
            side,
            price,
            size_ciphertext,
            input_type,
            escrow_ciphertext,
            escrow_input_type,
        )
    }

    pub fn cancel_order(
        ctx: Context<CancelOrder>,
        remaining_ciphertext: Vec<u8>,
        input_type: u8,
    ) -> Result<()> {
        instructions::cancel_order::handler(ctx, remaining_ciphertext, input_type)
    }

    pub fn close_order(ctx: Context<CloseOrder>) -> Result<()> {
        instructions::close_order::handler(ctx)
    }

    pub fn match_order(
        ctx: Context<MatchOrder>,
        taker_side: u8,
        taker_price: u64,
        taker_req_base_ciphertext: Vec<u8>,
        fill_base_ciphertext: Vec<u8>,
        fill_quote_ciphertext: Vec<u8>,
        input_type: u8,
        claim_plaintext_amount: u64,
    ) -> Result<()> {
        instructions::match_order::handler(
            ctx,
            taker_side,
            taker_price,
            taker_req_base_ciphertext,
            fill_base_ciphertext,
            fill_quote_ciphertext,
            input_type,
            claim_plaintext_amount,
        )
    }

    pub fn maker_claim_filled_order(
        ctx: Context<MakerClaimFilledOrder>,
    ) -> Result<()> {
        instructions::maker_claim_filled_order::handler(ctx)
    }

    pub fn reset_state(ctx: Context<ResetState>) -> Result<()> {
        instructions::reset_state::handler(ctx)
    }

    pub fn bump_order_seq(ctx: Context<BumpOrderSeq>) -> Result<()> {
        instructions::bump_order_seq::handler(ctx)
    }
}
