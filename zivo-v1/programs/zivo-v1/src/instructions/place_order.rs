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
use crate::state::{Order, OrderbookState, MAX_ESCROW_CIPHERTEXT_LEN};

pub fn handler(
    ctx: Context<PlaceOrder>,
    side: u8,
    price: u64,
    size_ciphertext: Vec<u8>,
    input_type: u8,
    escrow_ciphertext: Vec<u8>,
    escrow_input_type: u8,
) -> Result<()> {
    let state = &mut ctx.accounts.state;
    let signer = ctx.accounts.trader.to_account_info();
    let inco = ctx.accounts.inco_lightning_program.to_account_info();

    if size_ciphertext.is_empty() || escrow_ciphertext.is_empty() {
        return err!(OrderbookError::InvalidEscrowCiphertext);
    }
    if size_ciphertext.len() > MAX_ESCROW_CIPHERTEXT_LEN
        || escrow_ciphertext.len() > MAX_ESCROW_CIPHERTEXT_LEN
    {
        return err!(OrderbookError::InvalidEscrowCiphertext);
    }

    let remaining_handle: Euint128 = cpi::new_euint128(
        CpiContext::new(inco, Operation { signer: signer.clone() }),
        size_ciphertext,
        input_type,
    )?;

    if side == 0 {
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
            escrow_ciphertext,
            escrow_input_type,
        )?;
    } else if side == 1 {
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
            escrow_ciphertext,
            escrow_input_type,
        )?;
    } else {
        return err!(OrderbookError::InvalidSide);
    }

    let order = &mut ctx.accounts.order;
    order.owner = ctx.accounts.trader.key();
    order.side = side;
    order.is_open = 1;
    order.price = price;
    order.seq = state.order_seq;
    order.remaining_handle = remaining_handle.0;
    order.bump = ctx.bumps.order;
    order._padding = [0u8; 6];
    order._reserved = [0u8; 7];

    state.order_seq = state.order_seq.wrapping_add(1);

    Ok(())
}

#[derive(Accounts)]
#[instruction(side: u8, price: u64)]
pub struct PlaceOrder<'info> {
    #[account(mut)]
    pub state: Account<'info, OrderbookState>,
    #[account(
        init,
        payer = trader,
        space = 8 + Order::LEN,
        seeds = [b"order_v1", state.key().as_ref(), trader.key().as_ref(), &state.order_seq.to_le_bytes()],
        bump
    )]
    pub order: Account<'info, Order>,
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
