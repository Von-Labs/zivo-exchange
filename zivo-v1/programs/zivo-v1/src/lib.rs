use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

pub use instructions::*;

declare_id!("4byezjJM8chC4HLKVJ3cYfEpPQR2AB3Mf19S4b6Pzpaz");

#[program]
pub mod zivo_orderbook_program {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize::handler(ctx)
    }

    pub fn initialize_deposit(ctx: Context<InitializeDeposit>) -> Result<()> {
        instructions::initialize_deposit::handler(ctx)
    }

    pub fn place_order(
        ctx: Context<PlaceOrder>,
        side: u8,
        price_ciphertext: Vec<u8>,
        qty_ciphertext: Vec<u8>,
        input_type: u8,
        escrow_base_ciphertext: Vec<u8>,
        escrow_quote_ciphertext: Vec<u8>,
        client_order_id: u64,
    ) -> Result<()> {
        instructions::place_order::handler(
            ctx,
            side,
            price_ciphertext,
            qty_ciphertext,
            input_type,
            escrow_base_ciphertext,
            escrow_quote_ciphertext,
            client_order_id,
        )
    }

    pub fn cancel_order(
        ctx: Context<CancelOrder>,
        side: u8,
        client_order_id: u64,
        escrow_ciphertext: Vec<u8>,
        input_type: u8,
    ) -> Result<()> {
        instructions::cancel_order::handler(ctx, side, client_order_id, escrow_ciphertext, input_type)
    }

    pub fn submit_match(ctx: Context<SubmitMatch>, args: SubmitMatchArgs) -> Result<()> {
        instructions::submit_match::handler(ctx, args)
    }

    pub fn settle_match(ctx: Context<SettleMatch>, args: SettleMatchArgs) -> Result<()> {
        instructions::settle_match::handler(ctx, args)
    }

    pub fn reset_state(ctx: Context<ResetState>) -> Result<()> {
        instructions::reset_state::handler(ctx)
    }
}
