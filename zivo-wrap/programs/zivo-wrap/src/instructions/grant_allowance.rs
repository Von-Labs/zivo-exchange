use anchor_lang::prelude::*;
use inco_lightning::cpi::accounts::Allow;
use inco_lightning::cpi::allow;

pub fn handler<'info>(ctx: Context<'_, '_, '_, 'info, GrantAllowance<'info>>) -> Result<()> {
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
        allow(
            cpi_ctx,
            user_inco_account.amount.0,
            true,
            ctx.accounts.user.key(),
        )?;
    }

    Ok(())
}

#[derive(Accounts)]
pub struct GrantAllowance<'info> {
    #[account(mut)]
    pub inco_token_mint: Account<'info, inco_token::IncoMint>,

    #[account(
        mut,
        constraint = user_inco_token_account.mint == inco_token_mint.key(),
        constraint = user_inco_token_account.owner == user.key()
    )]
    pub user_inco_token_account: Account<'info, inco_token::IncoAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,

    /// CHECK: Inco Lightning program
    #[account(address = inco_lightning::ID)]
    pub inco_lightning_program: AccountInfo<'info>,
}
