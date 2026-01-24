use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

pub use instructions::*;

declare_id!("H7UKsdsVqUamXXSNA4iK58W1ELuZB3FzJhh4wFqFNpWD");

#[program]
pub mod zivo_wrap {
    use super::*;

    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        instructions::initialize_vault::handler(ctx)
    }

    pub fn wrap_token<'info>(
        ctx: Context<'_, '_, '_, 'info, WrapToken<'info>>,
        ciphertext: Vec<u8>,
        input_type: u8,
        amount: u64,
    ) -> Result<()> {
        instructions::wrap_token::handler(ctx, ciphertext, input_type, amount)
    }

    pub fn grant_allowance<'info>(
        ctx: Context<'_, '_, '_, 'info, GrantAllowance<'info>>,
    ) -> Result<()> {
        instructions::grant_allowance::handler(ctx)
    }

    pub fn unwrap_token<'info>(
        ctx: Context<'_, '_, '_, 'info, UnwrapToken<'info>>,
        ciphertext: Vec<u8>,
        input_type: u8,
        plaintext_amount: u64,
    ) -> Result<()> {
        instructions::unwrap_token::handler(ctx, ciphertext, input_type, plaintext_amount)
    }
}
