use anchor_lang::prelude::*;
use inco_token::{
    cpi as inco_token_cpi,
    cpi::accounts::IncoTransfer,
    program::IncoToken,
    IncoAccount,
    ID as INCO_TOKEN_ID,
};
use inco_lightning::{program::IncoLightning, ID as INCO_LIGHTNING_ID};

use crate::errors::OrderbookError;
use crate::state::{Order, OrderbookState, MAX_ESCROW_CIPHERTEXT_LEN};

pub fn handler(
    ctx: Context<MakerClaimFilledOrder>,
) -> Result<()> {
    let state = &ctx.accounts.state;
    let order = &mut ctx.accounts.order;

    if order.owner != ctx.accounts.maker.key() {
        return err!(OrderbookError::InvalidOrderOwner);
    }
    if order.is_open {
        return err!(OrderbookError::OrderStillOpen);
    }
    if !order.is_filled {
        return err!(OrderbookError::OrderNotFilled);
    }
    if order.is_claimed {
        return err!(OrderbookError::OrderAlreadyClaimed);
    }
    if order.claim_ciphertext.is_empty() {
        return err!(OrderbookError::InvalidEscrowCiphertext);
    }
    if order.claim_ciphertext.len() > MAX_ESCROW_CIPHERTEXT_LEN {
        return err!(OrderbookError::InvalidEscrowCiphertext);
    }
    let claim_ciphertext = order.claim_ciphertext.clone();
    let input_type = order.claim_input_type;

    let vault_authority_bump = ctx.bumps.inco_vault_authority;
    let state_key = state.key();
    let vault_seeds: &[&[u8]] = &[
        b"inco_vault_authority_v12",
        state_key.as_ref(),
        &[vault_authority_bump],
    ];

    if order.side == 0 {
        // Maker bid: claim base from base vault.
        ensure_inco_account(
            &ctx.accounts.maker_base_inco,
            order.owner,
            state.inco_base_mint,
        )?;
        ensure_inco_account(
            &ctx.accounts.inco_base_vault,
            state.inco_vault_authority,
            state.inco_base_mint,
        )?;

        inco_token_cpi::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.inco_token_program.to_account_info(),
                IncoTransfer {
                    source: ctx.accounts.inco_base_vault.to_account_info(),
                    destination: ctx.accounts.maker_base_inco.to_account_info(),
                    authority: ctx.accounts.inco_vault_authority.to_account_info(),
                    inco_lightning_program: ctx.accounts.inco_lightning_program.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                },
                &[vault_seeds],
            ),
            claim_ciphertext,
            input_type,
        )?;
    } else if order.side == 1 {
        // Maker ask: claim quote from quote vault.
        ensure_inco_account(
            &ctx.accounts.maker_quote_inco,
            order.owner,
            state.inco_quote_mint,
        )?;
        ensure_inco_account(
            &ctx.accounts.inco_quote_vault,
            state.inco_vault_authority,
            state.inco_quote_mint,
        )?;

        inco_token_cpi::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.inco_token_program.to_account_info(),
                IncoTransfer {
                    source: ctx.accounts.inco_quote_vault.to_account_info(),
                    destination: ctx.accounts.maker_quote_inco.to_account_info(),
                    authority: ctx.accounts.inco_vault_authority.to_account_info(),
                    inco_lightning_program: ctx.accounts.inco_lightning_program.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                },
                &[vault_seeds],
            ),
            claim_ciphertext,
            input_type,
        )?;
    } else {
        return err!(OrderbookError::InvalidSide);
    }

    order.is_claimed = true;
    Ok(())
}

#[derive(Accounts)]
pub struct MakerClaimFilledOrder<'info> {
    #[account(mut)]
    pub state: Account<'info, OrderbookState>,
    #[account(
        mut,
        has_one = owner,
        seeds = [b"order_v1", state.key().as_ref(), owner.key().as_ref(), &order.seq.to_le_bytes()],
        bump = order.bump
    )]
    pub order: Account<'info, Order>,
    /// CHECK: maker owner stored in order
    pub owner: UncheckedAccount<'info>,
    #[account(mut)]
    pub maker: Signer<'info>,
    #[account(
        mut,
        seeds = [b"inco_vault_authority_v12", state.key().as_ref()],
        bump,
        address = state.inco_vault_authority
    )]
    /// CHECK: PDA authority for Inco vaults
    pub inco_vault_authority: UncheckedAccount<'info>,
    /// CHECK: Inco vault accounts (owned by inco-token program)
    #[account(mut, address = state.inco_base_vault)]
    pub inco_base_vault: UncheckedAccount<'info>,
    /// CHECK: Inco vault accounts (owned by inco-token program)
    #[account(mut, address = state.inco_quote_vault)]
    pub inco_quote_vault: UncheckedAccount<'info>,
    /// CHECK: Maker Inco accounts
    #[account(mut)]
    pub maker_base_inco: UncheckedAccount<'info>,
    /// CHECK: Maker Inco accounts
    #[account(mut)]
    pub maker_quote_inco: UncheckedAccount<'info>,
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
