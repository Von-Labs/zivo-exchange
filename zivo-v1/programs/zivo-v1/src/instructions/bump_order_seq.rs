use anchor_lang::prelude::*;

use crate::errors::OrderbookError;
use crate::state::OrderbookState;

pub fn handler(ctx: Context<BumpOrderSeq>) -> Result<()> {
    let state = &mut ctx.accounts.state;
    if ctx.accounts.admin.key() != state.admin {
        return err!(OrderbookError::UnauthorizedMatcher);
    }
    state.order_seq = state.order_seq.wrapping_add(1);
    Ok(())
}

#[derive(Accounts)]
pub struct BumpOrderSeq<'info> {
    #[account(mut)]
    pub state: Account<'info, OrderbookState>,
    #[account(mut)]
    pub admin: Signer<'info>,
}
