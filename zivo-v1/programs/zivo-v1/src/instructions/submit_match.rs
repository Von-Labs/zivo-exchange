use anchor_lang::prelude::*;

use crate::errors::OrderbookError;
use crate::state::{MatchRecord, OrderbookState};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SubmitMatchArgs {
    pub match_id: u64,
    pub bid_owner: Pubkey,
    pub ask_owner: Pubkey,
    pub base_amount_handle: u128,
    pub quote_amount_handle: u128,
}

#[derive(Accounts)]
#[instruction(args: SubmitMatchArgs)]
pub struct SubmitMatch<'info> {
    #[account(mut)]
    pub state: Account<'info, OrderbookState>,
    #[account(
        init,
        payer = payer,
        space = 8 + MatchRecord::LEN,
        seeds = [b"match_record", state.key().as_ref(), &args.match_id.to_le_bytes()],
        bump
    )]
    pub match_record: Account<'info, MatchRecord>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub validator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<SubmitMatch>, args: SubmitMatchArgs) -> Result<()> {
    if args.bid_owner == args.ask_owner {
        return err!(OrderbookError::CounterpartyMismatch);
    }

    let record = &mut ctx.accounts.match_record;
    record.match_id = args.match_id;
    record.bid_owner = args.bid_owner;
    record.ask_owner = args.ask_owner;
    record.base_amount_handle = args.base_amount_handle;
    record.quote_amount_handle = args.quote_amount_handle;
    record.status = 0;
    record.validator = ctx.accounts.validator.key();
    record._padding = [0u8; 7];

    Ok(())
}
