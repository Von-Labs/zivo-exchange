use anchor_lang::prelude::*;
use inco_lightning::{program::IncoLightning, ID as INCO_LIGHTNING_ID};
use inco_token::{
    cpi as inco_token_cpi,
    cpi::accounts::IncoTransfer,
    program::IncoToken,
    IncoAccount,
    ID as INCO_TOKEN_ID,
};

use crate::errors::OrderbookError;
use crate::state::{MatchRecord, OrderbookState};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SettleMatchArgs {
    pub match_id: u64,
    pub base_ciphertext: Vec<u8>,
    pub quote_ciphertext: Vec<u8>,
    pub input_type: u8,
}

#[derive(Accounts)]
#[instruction(args: SettleMatchArgs)]
pub struct SettleMatch<'info> {
    #[account(mut)]
    pub state: Account<'info, OrderbookState>,
    #[account(
        mut,
        seeds = [b"match_record", state.key().as_ref(), &args.match_id.to_le_bytes()],
        bump,
    )]
    pub match_record: Account<'info, MatchRecord>,
    #[account(mut, seeds = [b"inco_vault_authority_v11"], bump, address = state.inco_vault_authority)]
    /// CHECK: PDA authority for Inco vaults
    pub inco_vault_authority: UncheckedAccount<'info>,
    /// CHECK: Inco vault accounts (owned by inco-token program)
    #[account(mut, address = state.inco_base_vault)]
    pub inco_base_vault: UncheckedAccount<'info>,
    /// CHECK: Inco vault accounts (owned by inco-token program)
    #[account(mut, address = state.inco_quote_vault)]
    pub inco_quote_vault: UncheckedAccount<'info>,
    /// CHECK: Bid owner base account
    #[account(mut)]
    pub bid_owner_base_inco: UncheckedAccount<'info>,
    /// CHECK: Ask owner quote account
    #[account(mut)]
    pub ask_owner_quote_inco: UncheckedAccount<'info>,
    /// CHECK: Inco base mint
    #[account(address = state.inco_base_mint)]
    pub inco_base_mint: UncheckedAccount<'info>,
    /// CHECK: Inco quote mint
    #[account(address = state.inco_quote_mint)]
    pub inco_quote_mint: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    pub inco_token_program: Program<'info, IncoToken>,
    /// CHECK: Inco Lightning program
    #[account(address = INCO_LIGHTNING_ID)]
    pub inco_lightning_program: Program<'info, IncoLightning>,
}

pub fn handler(ctx: Context<SettleMatch>, args: SettleMatchArgs) -> Result<()> {
    let record = &mut ctx.accounts.match_record;

    if record.status != 0 {
        return err!(OrderbookError::MatchAlreadySettled);
    }
    if args.base_ciphertext.is_empty() || args.quote_ciphertext.is_empty() {
        return err!(OrderbookError::InvalidEscrowCiphertext);
    }

    ensure_inco_account(
        &ctx.accounts.bid_owner_base_inco,
        record.bid_owner,
        ctx.accounts.inco_base_mint.key(),
    )?;
    ensure_inco_account(
        &ctx.accounts.ask_owner_quote_inco,
        record.ask_owner,
        ctx.accounts.inco_quote_mint.key(),
    )?;
    ensure_inco_account(
        &ctx.accounts.inco_base_vault,
        ctx.accounts.inco_vault_authority.key(),
        ctx.accounts.inco_base_mint.key(),
    )?;
    ensure_inco_account(
        &ctx.accounts.inco_quote_vault,
        ctx.accounts.inco_vault_authority.key(),
        ctx.accounts.inco_quote_mint.key(),
    )?;

    let vault_authority_bump = ctx.bumps.inco_vault_authority;
    let vault_seeds: &[&[u8]] = &[b"inco_vault_authority_v11", &[vault_authority_bump]];

    inco_token_cpi::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.inco_token_program.to_account_info(),
            IncoTransfer {
                source: ctx.accounts.inco_base_vault.to_account_info(),
                destination: ctx.accounts.bid_owner_base_inco.to_account_info(),
                authority: ctx.accounts.inco_vault_authority.to_account_info(),
                inco_lightning_program: ctx.accounts.inco_lightning_program.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
            },
            &[vault_seeds],
        ),
        args.base_ciphertext,
        args.input_type,
    )?;

    inco_token_cpi::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.inco_token_program.to_account_info(),
            IncoTransfer {
                source: ctx.accounts.inco_quote_vault.to_account_info(),
                destination: ctx.accounts.ask_owner_quote_inco.to_account_info(),
                authority: ctx.accounts.inco_vault_authority.to_account_info(),
                inco_lightning_program: ctx.accounts.inco_lightning_program.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
            },
            &[vault_seeds],
        ),
        args.quote_ciphertext,
        args.input_type,
    )?;

    record.status = 1;

    Ok(())
}

fn ensure_inco_account(
    account: &UncheckedAccount<'_>,
    expected_owner: Pubkey,
    expected_mint: Pubkey,
) -> Result<()> {
    let info = account.to_account_info();
    if info.owner != &INCO_TOKEN_ID {
        return err!(OrderbookError::InvalidIncoProgramOwner);
    }
    let data = info.try_borrow_data()?;
    let decoded = IncoAccount::try_deserialize(&mut &data[..])
        .map_err(|_| error!(OrderbookError::InvalidIncoAccountData))?;

    if decoded.owner != expected_owner {
        return err!(OrderbookError::InvalidIncoAccountOwner);
    }
    if decoded.mint != expected_mint {
        return err!(OrderbookError::InvalidIncoAccountMint);
    }
    Ok(())
}
