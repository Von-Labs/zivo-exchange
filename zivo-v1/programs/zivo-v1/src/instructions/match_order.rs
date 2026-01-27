use anchor_lang::prelude::*;
use inco_lightning::{
    cpi,
    cpi::accounts::{Operation, VerifySignature},
    program::IncoLightning,
    types::{Ebool, Euint128},
    ID as INCO_LIGHTNING_ID,
};
use inco_token::{
    cpi as inco_token_cpi,
    cpi::accounts::IncoTransfer,
    program::IncoToken,
    IncoAccount,
    ID as INCO_TOKEN_ID,
};

use crate::errors::OrderbookError;
use crate::state::{Order, OrderbookState, MAX_ESCROW_CIPHERTEXT_LEN};

pub fn handler(
    ctx: Context<MatchOrder>,
    taker_side: u8,
    taker_price: u64,
    taker_req_base_ciphertext: Vec<u8>,
    fill_base_ciphertext: Vec<u8>,
    fill_quote_ciphertext: Vec<u8>,
    input_type: u8,
) -> Result<()> {
    let state = &mut ctx.accounts.state;
    let order = &mut ctx.accounts.maker_order;

    if ctx.accounts.matcher.key() != state.admin {
        return err!(OrderbookError::UnauthorizedMatcher);
    }
    if order.is_open == 0 {
        return err!(OrderbookError::OrderClosed);
    }
    if order.side == taker_side {
        return err!(OrderbookError::InvalidSide);
    }
    if order.price != taker_price {
        return err!(OrderbookError::PriceMismatch);
    }
    if taker_req_base_ciphertext.is_empty()
        || fill_base_ciphertext.is_empty()
        || fill_quote_ciphertext.is_empty()
    {
        return err!(OrderbookError::InvalidEscrowCiphertext);
    }
    if taker_req_base_ciphertext.len() > MAX_ESCROW_CIPHERTEXT_LEN
        || fill_base_ciphertext.len() > MAX_ESCROW_CIPHERTEXT_LEN
        || fill_quote_ciphertext.len() > MAX_ESCROW_CIPHERTEXT_LEN
    {
        return err!(OrderbookError::InvalidEscrowCiphertext);
    }

    let inco = ctx.accounts.inco_lightning_program.to_account_info();
    let signer = ctx.accounts.matcher.to_account_info();

    let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
    let req_base: Euint128 = cpi::new_euint128(cpi_ctx, taker_req_base_ciphertext.clone(), input_type)?;

    let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
    let has_sufficient: Ebool = cpi::e_ge(
        cpi_ctx,
        Euint128(order.remaining_handle),
        req_base,
        0,
    )?;

    let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
    let actual_base: Euint128 = cpi::e_select(
        cpi_ctx,
        has_sufficient,
        req_base,
        Euint128(order.remaining_handle),
        0,
    )?;

    let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
    let remaining: Euint128 = cpi::e_sub(
        cpi_ctx,
        Euint128(order.remaining_handle),
        actual_base,
        0,
    )?;
    order.remaining_handle = remaining.0;

    let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
    let fill_base_handle: Euint128 =
        cpi::new_euint128(cpi_ctx, fill_base_ciphertext.clone(), input_type)?;

    if state.require_attestation == 1 {
        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let matches_actual: Ebool = cpi::e_eq(cpi_ctx, actual_base, fill_base_handle, 0)?;
        let handle_bytes = matches_actual.0.to_le_bytes().to_vec();
        let cpi_ctx = CpiContext::new(
            inco.clone(),
            VerifySignature {
                instructions: ctx.accounts.instructions.to_account_info(),
                signer,
            },
        );
        cpi::is_validsignature(
            cpi_ctx,
            1,
            Some(vec![handle_bytes]),
            Some(vec![vec![1u8]]),
        )?;
    }

    if order.side == 1 {
        // Maker ask: base escrowed in base vault.
        ensure_inco_account(
            &ctx.accounts.maker_base_inco,
            order.owner,
            state.inco_base_mint,
        )?;
        ensure_inco_account(
            &ctx.accounts.taker_base_inco,
            ctx.accounts.taker.key(),
            state.inco_base_mint,
        )?;
        ensure_inco_account(
            &ctx.accounts.taker_quote_inco,
            ctx.accounts.taker.key(),
            state.inco_quote_mint,
        )?;
        ensure_inco_account(
            &ctx.accounts.maker_quote_inco,
            order.owner,
            state.inco_quote_mint,
        )?;
        ensure_inco_account(
            &ctx.accounts.inco_base_vault,
            state.inco_vault_authority,
            state.inco_base_mint,
        )?;
        ensure_inco_account(
            &ctx.accounts.inco_quote_vault,
            state.inco_vault_authority,
            state.inco_quote_mint,
        )?;

        let vault_authority_bump = ctx.bumps.inco_vault_authority;
        let state_key = state.key();
        let vault_seeds: &[&[u8]] = &[
            b"inco_vault_authority_v12",
            state_key.as_ref(),
            &[vault_authority_bump],
        ];

        inco_token_cpi::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.inco_token_program.to_account_info(),
                IncoTransfer {
                    source: ctx.accounts.inco_base_vault.to_account_info(),
                    destination: ctx.accounts.taker_base_inco.to_account_info(),
                    authority: ctx.accounts.inco_vault_authority.to_account_info(),
                    inco_lightning_program: ctx.accounts.inco_lightning_program.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                },
                &[vault_seeds],
            ),
            fill_base_ciphertext,
            input_type,
        )?;

        inco_token_cpi::transfer(
            CpiContext::new(
                ctx.accounts.inco_token_program.to_account_info(),
                IncoTransfer {
                    source: ctx.accounts.taker_quote_inco.to_account_info(),
                    destination: ctx.accounts.maker_quote_inco.to_account_info(),
                    authority: ctx.accounts.taker.to_account_info(),
                    inco_lightning_program: ctx.accounts.inco_lightning_program.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                },
            ),
            fill_quote_ciphertext,
            input_type,
        )?;
    } else {
        // Maker bid: quote escrowed in quote vault.
        ensure_inco_account(
            &ctx.accounts.maker_quote_inco,
            order.owner,
            state.inco_quote_mint,
        )?;
        ensure_inco_account(
            &ctx.accounts.taker_quote_inco,
            ctx.accounts.taker.key(),
            state.inco_quote_mint,
        )?;
        ensure_inco_account(
            &ctx.accounts.taker_base_inco,
            ctx.accounts.taker.key(),
            state.inco_base_mint,
        )?;
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
        ensure_inco_account(
            &ctx.accounts.inco_quote_vault,
            state.inco_vault_authority,
            state.inco_quote_mint,
        )?;

        let vault_authority_bump = ctx.bumps.inco_vault_authority;
        let state_key = state.key();
        let vault_seeds: &[&[u8]] = &[
            b"inco_vault_authority_v12",
            state_key.as_ref(),
            &[vault_authority_bump],
        ];

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
            fill_quote_ciphertext,
            input_type,
        )?;

        inco_token_cpi::transfer(
            CpiContext::new(
                ctx.accounts.inco_token_program.to_account_info(),
                IncoTransfer {
                    source: ctx.accounts.taker_base_inco.to_account_info(),
                    destination: ctx.accounts.maker_base_inco.to_account_info(),
                    authority: ctx.accounts.taker.to_account_info(),
                    inco_lightning_program: ctx.accounts.inco_lightning_program.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                },
            ),
            fill_base_ciphertext,
            input_type,
        )?;
    }

    Ok(())
}

#[derive(Accounts)]
#[instruction(taker_side: u8, taker_price: u64)]
pub struct MatchOrder<'info> {
    #[account(mut)]
    pub state: Account<'info, OrderbookState>,
    #[account(
        mut,
        has_one = owner,
        seeds = [b"order_v1", state.key().as_ref(), owner.key().as_ref(), &maker_order.seq.to_le_bytes()],
        bump = maker_order.bump
    )]
    pub maker_order: Account<'info, Order>,
    /// CHECK: maker owner stored in order
    pub owner: UncheckedAccount<'info>,
    #[account(mut)]
    pub matcher: Signer<'info>,
    #[account(mut)]
    pub taker: Signer<'info>,
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
    /// CHECK: Taker Inco accounts
    #[account(mut)]
    pub taker_base_inco: UncheckedAccount<'info>,
    /// CHECK: Taker Inco accounts
    #[account(mut)]
    pub taker_quote_inco: UncheckedAccount<'info>,
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
    /// CHECK: Instructions sysvar for signature verification
    pub instructions: UncheckedAccount<'info>,
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
