use anchor_lang::prelude::*;
use inco_lightning::{
    cpi,
    cpi::accounts::Operation,
    program::IncoLightning,
    types::Euint128,
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
use crate::state::{OrderSlot, OrderbookState};

pub fn handler(
    ctx: Context<PlaceOrder>,
    side: u8,
    price_ciphertext: Vec<u8>,
    qty_ciphertext: Vec<u8>,
    input_type: u8,
    escrow_base_ciphertext: Vec<u8>,
    escrow_quote_ciphertext: Vec<u8>,
    client_order_id: u64,
) -> Result<()> {
    let state = &mut ctx.accounts.state;
    let signer = ctx.accounts.trader.to_account_info();
    let inco = ctx.accounts.inco_lightning_program.to_account_info();

    let price_handle: Euint128 = cpi::new_euint128(
        CpiContext::new(inco.clone(), Operation { signer: signer.clone() }),
        price_ciphertext,
        input_type,
    )?;

    let qty_handle: Euint128 = cpi::new_euint128(
        CpiContext::new(inco.clone(), Operation { signer: signer.clone() }),
        qty_ciphertext,
        input_type,
    )?;

    if side == 0 {
        if escrow_quote_ciphertext.is_empty() {
            return err!(OrderbookError::InvalidEscrowCiphertext);
        }
        if state.best_bid.is_active != 0 {
            return err!(OrderbookError::OrderSlotOccupied);
        }

        ensure_inco_account(
            &ctx.accounts.trader_quote_inco,
            ctx.accounts.trader.key(),
            state.inco_quote_mint,
        )?;
        ensure_inco_account(
            &ctx.accounts.inco_quote_vault,
            state.inco_vault_authority,
            state.inco_quote_mint,
        )?;

        inco_token_cpi::transfer(
            CpiContext::new(
                ctx.accounts.inco_token_program.to_account_info(),
                IncoTransfer {
                    source: ctx.accounts.trader_quote_inco.to_account_info(),
                    destination: ctx.accounts.inco_quote_vault.to_account_info(),
                    authority: ctx.accounts.trader.to_account_info(),
                    inco_lightning_program: ctx.accounts.inco_lightning_program.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                },
            ),
            escrow_quote_ciphertext,
            input_type,
        )?;

        state.best_bid = OrderSlot::new(
            ctx.accounts.trader.key(),
            price_handle.0,
            qty_handle.0,
            client_order_id,
            0,
            0,
        );
        state.bid_count = 1;
    } else if side == 1 {
        if escrow_base_ciphertext.is_empty() {
            return err!(OrderbookError::InvalidEscrowCiphertext);
        }
        if state.best_ask.is_active != 0 {
            return err!(OrderbookError::OrderSlotOccupied);
        }

        ensure_inco_account(
            &ctx.accounts.trader_base_inco,
            ctx.accounts.trader.key(),
            state.inco_base_mint,
        )?;
        ensure_inco_account(
            &ctx.accounts.inco_base_vault,
            state.inco_vault_authority,
            state.inco_base_mint,
        )?;

        inco_token_cpi::transfer(
            CpiContext::new(
                ctx.accounts.inco_token_program.to_account_info(),
                IncoTransfer {
                    source: ctx.accounts.trader_base_inco.to_account_info(),
                    destination: ctx.accounts.inco_base_vault.to_account_info(),
                    authority: ctx.accounts.trader.to_account_info(),
                    inco_lightning_program: ctx.accounts.inco_lightning_program.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                },
            ),
            escrow_base_ciphertext,
            input_type,
        )?;

        state.best_ask = OrderSlot::new(
            ctx.accounts.trader.key(),
            price_handle.0,
            qty_handle.0,
            client_order_id,
            0,
            0,
        );
        state.ask_count = 1;
    } else {
        return err!(OrderbookError::InvalidSide);
    }

    state.last_match_handle = 0;
    state.order_seq = state.order_seq.wrapping_add(1);
    Ok(())
}

#[derive(Accounts)]
pub struct PlaceOrder<'info> {
    #[account(mut)]
    pub state: Account<'info, OrderbookState>,
    #[account(mut)]
    pub trader: Signer<'info>,
    #[account(seeds = [b"inco_vault_authority_v11"], bump, address = state.inco_vault_authority)]
    /// CHECK: PDA authority for Inco vaults
    pub inco_vault_authority: UncheckedAccount<'info>,
    /// CHECK: Inco vault accounts (owned by inco-token program)
    #[account(mut, address = state.inco_base_vault)]
    pub inco_base_vault: UncheckedAccount<'info>,
    /// CHECK: Inco vault accounts (owned by inco-token program)
    #[account(mut, address = state.inco_quote_vault)]
    pub inco_quote_vault: UncheckedAccount<'info>,
    /// CHECK: Trader Inco accounts
    #[account(mut)]
    pub trader_base_inco: UncheckedAccount<'info>,
    /// CHECK: Trader Inco accounts
    #[account(mut)]
    pub trader_quote_inco: UncheckedAccount<'info>,
    /// CHECK: Inco base mint
    #[account(address = state.inco_base_mint)]
    pub inco_base_mint: UncheckedAccount<'info>,
    /// CHECK: Inco quote mint
    #[account(address = state.inco_quote_mint)]
    pub inco_quote_mint: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    pub inco_token_program: Program<'info, IncoToken>,
    /// CHECK: Inco Lightning program for encrypted operations
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
