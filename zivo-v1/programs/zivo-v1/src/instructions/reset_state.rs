use anchor_lang::prelude::*;

use crate::state::{OrderSlot, OrderbookState};

#[derive(Accounts)]
pub struct ResetState<'info> {
    #[account(mut)]
    pub state: Account<'info, OrderbookState>,
    /// CHECK: admin authority allowed to reset in tests
    pub admin: Signer<'info>,
}

pub fn handler(ctx: Context<ResetState>) -> Result<()> {
    let state = &mut ctx.accounts.state;
    state.order_seq = 0;
    state.bid_count = 0;
    state.ask_count = 0;
    state.best_bid = OrderSlot::default();
    state.best_ask = OrderSlot::default();
    state.last_match_handle = 0;
    Ok(())
}
