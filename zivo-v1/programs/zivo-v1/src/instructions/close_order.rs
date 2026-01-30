use anchor_lang::prelude::*;
use inco_lightning::{
    cpi,
    cpi::accounts::Operation,
    program::IncoLightning,
    types::{Ebool, Euint128},
    ID as INCO_LIGHTNING_ID,
};

use crate::errors::OrderbookError;
use crate::state::{Order, OrderbookState};

pub fn handler(ctx: Context<CloseOrder>) -> Result<()> {
    let _state = &ctx.accounts.state;
    let order = &mut ctx.accounts.order;

    if order.is_open == 0 {
        return err!(OrderbookError::OrderClosed);
    }
    if order.owner != ctx.accounts.owner.key() {
        return err!(OrderbookError::InvalidIncoAccountOwner);
    }

    let inco = ctx.accounts.inco_lightning_program.to_account_info();
    let signer = ctx.accounts.owner.to_account_info();

    let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
    let zero: Euint128 = cpi::as_euint128(cpi_ctx, 0)?;

    let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
    let is_zero: Ebool = cpi::e_eq(
        cpi_ctx,
        Euint128(order.remaining_handle),
        zero,
        0,
    )?;

    order.is_filled = if is_zero.0 == 1 { 1 } else { 0 };

    order.is_open = 0;
    Ok(())
}

#[derive(Accounts)]
pub struct CloseOrder<'info> {
    #[account(mut)]
    pub state: Account<'info, OrderbookState>,
    #[account(
        mut,
        seeds = [b"order_v1", state.key().as_ref(), owner.key().as_ref(), &order.seq.to_le_bytes()],
        bump = order.bump
    )]
    pub order: Account<'info, Order>,
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: Inco Lightning program
    #[account(address = INCO_LIGHTNING_ID)]
    pub inco_lightning_program: Program<'info, IncoLightning>,
}
