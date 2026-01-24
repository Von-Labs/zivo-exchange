use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};
use inco_lightning::cpi::accounts::Allow;
use inco_lightning::cpi::allow;
use inco_lightning::ID as INCO_LIGHTNING_ID;
use inco_token::{self as inco_token_program, IncoMint, IncoAccount};

declare_id!("H7UKsdsVqUamXXSNA4iK58W1ELuZB3FzJhh4wFqFNpWD");

#[program]
pub mod zivo_wrap {
    use super::*;

    /// Initialize a vault for wrapping SPL token to Inco token
    /// User must have already created both SPL mint and Inco mint
    /// User must delegate mint authority of Inco mint to vault PDA before/after this
    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
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

    /// Wrap SPL tokens to Inco tokens
    /// Transfers SPL tokens from user to vault, mints encrypted Inco tokens to user
    /// remaining_accounts:
    ///   [0] allowance_account (mut) - PDA for decryption access
    ///   [1] user_address (readonly) - User's pubkey for allowance
    pub fn wrap_token<'info>(
        ctx: Context<'_, '_, '_, 'info, WrapToken<'info>>,
        ciphertext: Vec<u8>,
        input_type: u8,
        amount: u64,
    ) -> Result<()> {
        let vault = &ctx.accounts.vault;

        require!(vault.is_initialized, ErrorCode::VaultNotInitialized);
        require!(
            vault.spl_token_mint == ctx.accounts.spl_token_mint.key(),
            ErrorCode::InvalidMint
        );
        require!(
            vault.inco_token_mint == ctx.accounts.inco_token_mint.key(),
            ErrorCode::InvalidIncoMint
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
            [preimage.to_bytes()[0], preimage.to_bytes()[1], preimage.to_bytes()[2], preimage.to_bytes()[3],
             preimage.to_bytes()[4], preimage.to_bytes()[5], preimage.to_bytes()[6], preimage.to_bytes()[7]]
        };

        // Call Inco Token Program's mint_to instruction
        let mint_to_ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: inco_token_program::ID,
            accounts: vec![
                anchor_lang::solana_program::instruction::AccountMeta::new(ctx.accounts.inco_token_mint.key(), false),
                anchor_lang::solana_program::instruction::AccountMeta::new(ctx.accounts.user_inco_token_account.key(), false),
                anchor_lang::solana_program::instruction::AccountMeta::new(ctx.accounts.vault.key(), true),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(ctx.accounts.inco_lightning_program.key(), false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
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

    /// Grant decryption allowance for user's Inco token balance
    /// This must be called AFTER wrap/unwrap to grant allowance for the resulting handle
    /// remaining_accounts:
    ///   [0] allowance_account (mut) - PDA for decryption access
    ///   [1] user_address (readonly) - User's pubkey for allowance
    pub fn grant_allowance<'info>(
        ctx: Context<'_, '_, '_, 'info, GrantAllowance<'info>>,
    ) -> Result<()> {
        let user_inco_account = &ctx.accounts.user_inco_token_account;

        // Grant allowance to user if remaining_accounts provided
        if ctx.remaining_accounts.len() >= 2 {
            let allowance_account = &ctx.remaining_accounts[0];
            let user_address = &ctx.remaining_accounts[1];
            let inco = ctx.accounts.inco_lightning_program.to_account_info();

            let cpi_ctx = CpiContext::new(
                inco.clone(),
                Allow {
                    allowance_account: allowance_account.clone(),
                    signer: ctx.accounts.user.to_account_info(),
                    allowed_address: user_address.clone(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                },
            );
            allow(cpi_ctx, user_inco_account.amount.0, true, ctx.accounts.user.key())?;
        }

        Ok(())
    }

    /// Unwrap Inco tokens back to SPL tokens
    /// Burns encrypted Inco tokens from user, transfers SPL tokens from vault to user
    /// remaining_accounts:
    ///   [0] allowance_account (mut) - PDA for decryption access
    ///   [1] user_address (readonly) - User's pubkey for allowance
    pub fn unwrap_token<'info>(
        ctx: Context<'_, '_, '_, 'info, UnwrapToken<'info>>,
        ciphertext: Vec<u8>,
        input_type: u8,
        plaintext_amount: u64, // Amount to transfer in SPL tokens
    ) -> Result<()> {
        let vault = &ctx.accounts.vault;

        require!(vault.is_initialized, ErrorCode::VaultNotInitialized);
        require!(
            vault.spl_token_mint == ctx.accounts.spl_token_mint.key(),
            ErrorCode::InvalidMint
        );
        require!(
            vault.inco_token_mint == ctx.accounts.inco_token_mint.key(),
            ErrorCode::InvalidIncoMint
        );

        // 1. Burn Inco tokens from user via CPI to inco_token program
        let burn_accounts = inco_token_program::cpi::accounts::IncoBurn {
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
        ).with_remaining_accounts(ctx.remaining_accounts.to_vec());

        inco_token_program::cpi::burn(burn_ctx, ciphertext, input_type)?;

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
}

// ========== ACCOUNT STRUCTURES ==========

#[account]
pub struct Vault {
    pub authority: Pubkey,              // 32
    pub spl_token_mint: Pubkey,         // 32
    pub inco_token_mint: Pubkey,        // 32
    pub vault_token_account: Pubkey,    // 32
    pub is_initialized: bool,           // 1
    pub bump: u8,                       // 1
}

impl Vault {
    pub const LEN: usize = 32 + 32 + 32 + 32 + 1 + 1;
}

// ========== ACCOUNT CONTEXTS ==========

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
    pub inco_token_mint: Account<'info, IncoMint>,

    /// Vault's token account for holding SPL tokens
    #[account(
        constraint = vault_token_account.mint == spl_token_mint.key(),
        constraint = vault_token_account.owner == vault.key()
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
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
    pub inco_token_mint: Account<'info, IncoMint>,

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
    pub user_inco_token_account: Account<'info, IncoAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,

    /// CHECK: Inco Lightning program
    #[account(address = INCO_LIGHTNING_ID)]
    pub inco_lightning_program: AccountInfo<'info>,

    /// CHECK: Inco Token program for CPI
    #[account(address = inco_token_program::ID)]
    pub inco_token_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct GrantAllowance<'info> {
    #[account(mut)]
    pub inco_token_mint: Account<'info, IncoMint>,

    #[account(
        mut,
        constraint = user_inco_token_account.mint == inco_token_mint.key(),
        constraint = user_inco_token_account.owner == user.key()
    )]
    pub user_inco_token_account: Account<'info, IncoAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,

    /// CHECK: Inco Lightning program
    #[account(address = INCO_LIGHTNING_ID)]
    pub inco_lightning_program: AccountInfo<'info>,
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
    pub inco_token_mint: Account<'info, IncoMint>,

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
    pub user_inco_token_account: Account<'info, IncoAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,

    /// CHECK: Inco Lightning program
    #[account(address = INCO_LIGHTNING_ID)]
    pub inco_lightning_program: AccountInfo<'info>,

    /// CHECK: Inco Token program for CPI
    #[account(address = inco_token_program::ID)]
    pub inco_token_program: AccountInfo<'info>,
}

// ========== EVENTS ==========

#[event]
pub struct WrapEvent {
    pub user: Pubkey,
    pub spl_mint: Pubkey,
    pub inco_mint: Pubkey,
    pub amount: u64,
}

#[event]
pub struct UnwrapEvent {
    pub user: Pubkey,
    pub spl_mint: Pubkey,
    pub inco_mint: Pubkey,
    pub amount: u64,
}

// ========== ERROR CODES ==========

#[error_code]
pub enum ErrorCode {
    #[msg("Vault is not initialized")]
    VaultNotInitialized,
    #[msg("Invalid SPL token mint")]
    InvalidMint,
    #[msg("Invalid Inco token mint")]
    InvalidIncoMint,
    #[msg("Insufficient balance")]
    InsufficientBalance,
}
