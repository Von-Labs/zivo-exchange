use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::errors::WrapError;
use crate::state::{UnwrapEvent, Vault};

pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, UnwrapToken<'info>>,
    ciphertext: Vec<u8>,
    input_type: u8,
    plaintext_amount: u64,
) -> Result<()> {
    let vault = &ctx.accounts.vault;

    require!(vault.is_initialized, WrapError::VaultNotInitialized);
    require!(
        vault.spl_token_mint == ctx.accounts.spl_token_mint.key(),
        WrapError::InvalidMint
    );
    require!(
        vault.inco_token_mint == ctx.accounts.inco_token_mint.key(),
        WrapError::InvalidIncoMint
    );

    // 1. Burn Inco tokens from user via CPI to inco_token program
    let burn_accounts = inco_token::cpi::accounts::IncoBurn {
        account: ctx.accounts.user_inco_token_account.to_account_info(),
        mint: ctx.accounts.inco_token_mint.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
        inco_lightning_program: ctx.accounts.inco_lightning_program.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
    };

    let burn_ctx = CpiContext::new_with_signer(
        ctx.accounts.inco_token_program.to_account_info(),
        burn_accounts,
        &[],
    )
    .with_remaining_accounts(ctx.remaining_accounts.to_vec());

    inco_token::cpi::burn(burn_ctx, ciphertext, input_type)?;

    // 2. Transfer SPL tokens from vault to user
    let seeds = &[
        b"vault",
        vault.spl_token_mint.as_ref(),
        vault.inco_token_mint.as_ref(),
        &[vault.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.vault_token_account.to_account_info(),
        to: ctx.accounts.user_spl_token_account.to_account_info(),
        authority: ctx.accounts.vault.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    token::transfer(cpi_ctx, plaintext_amount)?;

    emit!(UnwrapEvent {
        user: ctx.accounts.user.key(),
        spl_mint: vault.spl_token_mint,
        inco_mint: vault.inco_token_mint,
        amount: plaintext_amount,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct UnwrapToken<'info> {
    #[account(
        mut,
        seeds = [b"vault", spl_token_mint.key().as_ref(), inco_token_mint.key().as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,

    pub spl_token_mint: Account<'info, Mint>,

    #[account(mut)]
    pub inco_token_mint: Account<'info, inco_token::IncoMint>,

    #[account(
        mut,
        constraint = user_spl_token_account.mint == spl_token_mint.key(),
        constraint = user_spl_token_account.owner == user.key()
    )]
    pub user_spl_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = vault_token_account.key() == vault.vault_token_account
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_inco_token_account.mint == inco_token_mint.key(),
        constraint = user_inco_token_account.owner == user.key()
    )]
    pub user_inco_token_account: Account<'info, inco_token::IncoAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,

    /// CHECK: Inco Lightning program
    #[account(address = inco_lightning::ID)]
    pub inco_lightning_program: AccountInfo<'info>,

    /// CHECK: Inco Token program for CPI
    #[account(address = inco_token::ID)]
    pub inco_token_program: AccountInfo<'info>,
}
