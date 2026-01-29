use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};

use crate::state::Vault;

pub fn handler(ctx: Context<InitializeVault>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;

    vault.authority = ctx.accounts.authority.key();
    vault.spl_token_mint = ctx.accounts.spl_token_mint.key();
    vault.inco_token_mint = ctx.accounts.inco_token_mint.key();
    vault.vault_token_account = ctx.accounts.vault_token_account.key();
    vault.is_initialized = true;
    vault.bump = ctx.bumps.vault;

    msg!("Vault initialized successfully");
    msg!("SPL Mint: {}", vault.spl_token_mint);
    msg!("Inco Mint: {}", vault.inco_token_mint);

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Vault::LEN,
        seeds = [b"vault", spl_token_mint.key().as_ref(), inco_token_mint.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,

    pub spl_token_mint: Account<'info, Mint>,

    /// Inco token mint that user has created
    pub inco_token_mint: Account<'info, inco_token::IncoMint>,

    /// Vault's token account for holding SPL tokens
    #[account(
        constraint = vault_token_account.mint == spl_token_mint.key()
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}
