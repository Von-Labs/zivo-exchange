use anchor_lang::prelude::*;

use crate::errors::OrderbookError;
use crate::state::OrderbookState;

#[derive(Accounts)]
pub struct ResetState<'info> {
    #[account(mut)]
    pub state: Account<'info, OrderbookState>,
    /// CHECK: admin authority allowed to reset in tests
    pub admin: Signer<'info>,
}

pub fn handler(ctx: Context<ResetState>) -> Result<()> {
    let state = &mut ctx.accounts.state;
    if ctx.accounts.admin.key() != state.admin {
        return err!(OrderbookError::UnauthorizedMatcher);
    }
    Ok(())
}
