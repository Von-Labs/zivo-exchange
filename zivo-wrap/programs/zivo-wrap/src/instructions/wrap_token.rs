use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::errors::WrapError;
use crate::state::{Vault, WrapEvent};

pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, WrapToken<'info>>,
    ciphertext: Vec<u8>,
    input_type: u8,
    amount: u64,
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

    // 1. Transfer SPL tokens from user to vault
    let cpi_accounts = Transfer {
        from: ctx.accounts.user_spl_token_account.to_account_info(),
        to: ctx.accounts.vault_token_account.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::transfer(cpi_ctx, amount)?;

    // 2. Mint encrypted Inco tokens via CPI to Inco Token Program
    let seeds = &[
        b"vault",
        vault.spl_token_mint.as_ref(),
        vault.inco_token_mint.as_ref(),
        &[vault.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    // Compute discriminator for mint_to: sighash("global:mint_to")
    let discriminator = {
        let preimage = anchor_lang::solana_program::hash::hashv(&[b"global:mint_to"]);
        [
            preimage.to_bytes()[0],
            preimage.to_bytes()[1],
            preimage.to_bytes()[2],
            preimage.to_bytes()[3],
            preimage.to_bytes()[4],
            preimage.to_bytes()[5],
            preimage.to_bytes()[6],
            preimage.to_bytes()[7],
        ]
    };

    // Call Inco Token Program's mint_to instruction
    let mint_to_ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: inco_token::ID,
        accounts: vec![
            anchor_lang::solana_program::instruction::AccountMeta::new(
                ctx.accounts.inco_token_mint.key(),
                false,
            ),
            anchor_lang::solana_program::instruction::AccountMeta::new(
                ctx.accounts.user_inco_token_account.key(),
                false,
            ),
            anchor_lang::solana_program::instruction::AccountMeta::new(
                ctx.accounts.vault.key(),
                true,
            ),
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(
                ctx.accounts.inco_lightning_program.key(),
                false,
            ),
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(
                ctx.accounts.system_program.key(),
                false,
            ),
        ],
        data: {
            // Build instruction data: discriminator + ciphertext + input_type
            let mut data = discriminator.to_vec();
            data.extend_from_slice(&(ciphertext.len() as u32).to_le_bytes());
            data.extend_from_slice(&ciphertext);
            data.push(input_type);
            data
        },
    };

    anchor_lang::solana_program::program::invoke_signed(
        &mint_to_ix,
        &[
            ctx.accounts.inco_token_mint.to_account_info(),
            ctx.accounts.user_inco_token_account.to_account_info(),
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.inco_lightning_program.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        signer_seeds,
    )?;

    emit!(WrapEvent {
        user: ctx.accounts.user.key(),
        spl_mint: vault.spl_token_mint,
        inco_mint: vault.inco_token_mint,
        amount,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct WrapToken<'info> {
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
