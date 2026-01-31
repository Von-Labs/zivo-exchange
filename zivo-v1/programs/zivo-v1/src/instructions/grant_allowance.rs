use anchor_lang::prelude::*;
use inco_lightning::cpi::accounts::Allow;
use inco_lightning::cpi::allow;
use inco_lightning::ID as INCO_LIGHTNING_ID;

pub fn handler<'info>(ctx: Context<'_, '_, '_, 'info, GrantAllowance<'info>>) -> Result<()> {
    let user_inco_account = &ctx.accounts.user_inco_token_account;

    if ctx.remaining_accounts.len() >= 2 {
        let allowance_account = &ctx.remaining_accounts[0];
        let allowed_address = &ctx.remaining_accounts[1];
        let inco = ctx.accounts.inco_lightning_program.to_account_info();
        let handle = user_inco_account.amount.0;
        let expected_allowance = allowance_pda_for(handle, allowed_address.key())?;

        msg!(
            "grant_allowance: user={} handle={} allowance={} expected={} allowed={}",
            ctx.accounts.user.key(),
            handle,
            allowance_account.key(),
            expected_allowance,
            allowed_address.key(),
        );
        if allowance_account.key() != expected_allowance {
            msg!("grant_allowance: allowance PDA mismatch");
        }

        let cpi_ctx = CpiContext::new(
            inco.clone(),
            Allow {
                allowance_account: allowance_account.clone(),
                signer: ctx.accounts.user.to_account_info(),
                allowed_address: allowed_address.clone(),
                system_program: ctx.accounts.system_program.to_account_info(),
            },
        );
        allow(
            cpi_ctx,
            handle,
            true,
            allowed_address.key(),
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
    #[account(address = INCO_LIGHTNING_ID)]
    pub inco_lightning_program: AccountInfo<'info>,
}

fn allowance_pda_for(handle: u128, allowed_address: Pubkey) -> Result<Pubkey> {
    let mut handle_bytes = [0u8; 16];
    handle_bytes.copy_from_slice(&handle.to_le_bytes());
    let (pda, _bump) =
        Pubkey::find_program_address(&[&handle_bytes, allowed_address.as_ref()], &INCO_LIGHTNING_ID);
    Ok(pda)
}
