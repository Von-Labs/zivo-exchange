use anchor_lang::prelude::*;

use crate::state::{ShieldedPoolConfig, Vault};

pub fn handler(ctx: Context<InitShieldedPool>, tree_depth: u8) -> Result<()> {
    let config = &mut ctx.accounts.shielded_pool;

    config.authority = ctx.accounts.authority.key();
    config.vault = ctx.accounts.vault.key();
    config.spl_token_mint = ctx.accounts.spl_token_mint.key();
    config.inco_token_mint = ctx.accounts.inco_token_mint.key();
    config.state_tree = ctx.accounts.state_tree.key();
    config.address_tree = ctx.accounts.address_tree.key();
    config.nullifier_queue = ctx.accounts.nullifier_queue.key();
    config.tree_depth = tree_depth;
    config.is_initialized = true;
    config.bump = ctx.bumps.shielded_pool;

    msg!("Shielded pool initialized");
    Ok(())
}

#[derive(Accounts)]
pub struct InitShieldedPool<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + ShieldedPoolConfig::LEN,
        seeds = [b"shielded_pool", spl_token_mint.key().as_ref(), inco_token_mint.key().as_ref()],
        bump
    )]
    pub shielded_pool: Account<'info, ShieldedPoolConfig>,

    #[account(
        constraint = vault.spl_token_mint == spl_token_mint.key(),
        constraint = vault.inco_token_mint == inco_token_mint.key()
    )]
    pub vault: Account<'info, Vault>,

    pub spl_token_mint: Account<'info, anchor_spl::token::Mint>,
    pub inco_token_mint: Account<'info, inco_token::IncoMint>,

    /// CHECK: Light state tree account
    pub state_tree: AccountInfo<'info>,
    /// CHECK: Light address tree account
    pub address_tree: AccountInfo<'info>,
    /// CHECK: Light nullifier queue account
    pub nullifier_queue: AccountInfo<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}
