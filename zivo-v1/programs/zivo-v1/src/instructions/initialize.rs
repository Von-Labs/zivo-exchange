use anchor_lang::prelude::*;
use inco_token::{IncoAccount, IncoMint, ID as INCO_TOKEN_ID};

use crate::errors::OrderbookError;
use crate::state::{OrderSlot, OrderbookState};

pub fn handler(ctx: Context<Initialize>) -> Result<()> {
    let state = &mut ctx.accounts.state;

    let base_mint = load_inco_mint(&ctx.accounts.inco_base_mint)?;
    let quote_mint = load_inco_mint(&ctx.accounts.inco_quote_mint)?;
    if !base_mint.is_initialized || !quote_mint.is_initialized {
        return err!(OrderbookError::InvalidIncoMintData);
    }

    let base_vault = load_inco_account(&ctx.accounts.inco_base_vault)?;
    let quote_vault = load_inco_account(&ctx.accounts.inco_quote_vault)?;

    if base_vault.mint != ctx.accounts.inco_base_mint.key() {
        return err!(OrderbookError::InvalidIncoAccountMint);
    }
    if quote_vault.mint != ctx.accounts.inco_quote_mint.key() {
        return err!(OrderbookError::InvalidIncoAccountMint);
    }
    if base_vault.owner != ctx.accounts.inco_vault_authority.key() {
        return err!(OrderbookError::InvalidIncoAccountOwner);
    }
    if quote_vault.owner != ctx.accounts.inco_vault_authority.key() {
        return err!(OrderbookError::InvalidIncoAccountOwner);
    }

    state.order_seq = 0;
    state.bid_count = 0;
    state.ask_count = 0;
    state.best_bid = OrderSlot::default();
    state.best_ask = OrderSlot::default();
    state.last_match_handle = 0;
    state.inco_base_mint = ctx.accounts.inco_base_mint.key();
    state.inco_quote_mint = ctx.accounts.inco_quote_mint.key();
    state.inco_vault_authority = ctx.accounts.inco_vault_authority.key();
    state.inco_base_vault = ctx.accounts.inco_base_vault.key();
    state.inco_quote_vault = ctx.accounts.inco_quote_vault.key();
    Ok(())
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + OrderbookState::LEN,
        seeds = [b"orderbook_state_v13"],
        bump
    )]
    pub state: Account<'info, OrderbookState>,
    #[account(seeds = [b"inco_vault_authority_v10"], bump)]
    /// CHECK: PDA authority for Inco vaults
    pub inco_vault_authority: UncheckedAccount<'info>,
    /// CHECK: Inco base vault (owned by inco-token program)
    #[account(mut)]
    pub inco_base_vault: UncheckedAccount<'info>,
    /// CHECK: Inco quote vault (owned by inco-token program)
    #[account(mut)]
    pub inco_quote_vault: UncheckedAccount<'info>,
    /// CHECK: Inco base mint (owned by inco-token program)
    pub inco_base_mint: UncheckedAccount<'info>,
    /// CHECK: Inco quote mint (owned by inco-token program)
    pub inco_quote_mint: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
    /// CHECK: Inco token program
    #[account(address = INCO_TOKEN_ID)]
    pub inco_token_program: UncheckedAccount<'info>,
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

fn load_inco_mint(account: &UncheckedAccount<'_>) -> Result<IncoMint> {
    let info = account.to_account_info();
    if info.owner != &INCO_TOKEN_ID {
        return err!(OrderbookError::InvalidIncoProgramOwner);
    }
    let data = info.try_borrow_data()?;
    IncoMint::try_deserialize(&mut &data[..]).map_err(|_| error!(OrderbookError::InvalidIncoMintData))
}
