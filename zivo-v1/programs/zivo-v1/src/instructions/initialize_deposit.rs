use anchor_lang::prelude::*;
use inco_token::{IncoAccount, ID as INCO_TOKEN_ID};

use crate::errors::OrderbookError;
use crate::state::{DepositAccount, OrderbookState};

#[derive(Accounts)]
pub struct InitializeDeposit<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [b"orderbook_state_v16"],
        bump
    )]
    pub state: Account<'info, OrderbookState>,
    #[account(
        init,
        payer = payer,
        space = 8 + DepositAccount::LEN,
        seeds = [b"deposit_v9", user.key().as_ref()],
        bump
    )]
    pub deposit: Account<'info, DepositAccount>,
    /// CHECK: User Inco base account
    pub user_base_inco: UncheckedAccount<'info>,
    /// CHECK: User Inco quote account
    pub user_quote_inco: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeDeposit>) -> Result<()> {
    let base_account = load_inco_account(&ctx.accounts.user_base_inco)?;
    let quote_account = load_inco_account(&ctx.accounts.user_quote_inco)?;

    if base_account.owner != ctx.accounts.user.key() {
        return err!(OrderbookError::InvalidIncoAccountOwner);
    }
    if quote_account.owner != ctx.accounts.user.key() {
        return err!(OrderbookError::InvalidIncoAccountOwner);
    }
    if base_account.mint != ctx.accounts.state.inco_base_mint {
        return err!(OrderbookError::InvalidIncoAccountMint);
    }
    if quote_account.mint != ctx.accounts.state.inco_quote_mint {
        return err!(OrderbookError::InvalidIncoAccountMint);
    }

    let deposit = &mut ctx.accounts.deposit;
    deposit.user = ctx.accounts.user.key();
    deposit.base_inco_account = ctx.accounts.user_base_inco.key();
    deposit.quote_inco_account = ctx.accounts.user_quote_inco.key();
    deposit.bump = ctx.bumps.deposit;
    deposit._padding = [0u8; 7];

    Ok(())
}

fn load_inco_account(account: &UncheckedAccount<'_>) -> Result<IncoAccount> {
    let info = account.to_account_info();
    if info.owner != &INCO_TOKEN_ID {
        return err!(OrderbookError::InvalidIncoProgramOwner);
    }
    let data = info.try_borrow_data()?;
    IncoAccount::try_deserialize(&mut &data[..])
        .map_err(|_| error!(OrderbookError::InvalidIncoAccountData))
}
