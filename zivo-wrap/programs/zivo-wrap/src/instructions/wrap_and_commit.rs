use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use light_sdk::{
    account::LightAccount,
    address::v2::derive_address,
    cpi::{v2::CpiAccounts, LightCpiInstruction},
    instruction::{PackedAddressTreeInfo, ValidityProof},
};
use light_sdk::cpi::InvokeLightSystemProgram;
use light_sdk::cpi::v2::LightSystemProgramCpi;

use crate::errors::WrapError;
use crate::state::{CommitmentAccount, ShieldedPoolConfig, Vault, WrapEvent};

const LIGHT_SYSTEM_ACCOUNTS_LEN: usize = 6;

pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, WrapAndCommit<'info>>,
    ciphertext: Vec<u8>,
    input_type: u8,
    amount: u64,
    commitment: [u8; 32],
    proof: ValidityProof,
    address_tree_info: PackedAddressTreeInfo,
    output_state_tree_index: u8,
    system_accounts_offset: u8,
) -> Result<()> {
    let vault = &ctx.accounts.vault;
    let pool = &ctx.accounts.shielded_pool;

    require!(vault.is_initialized, WrapError::VaultNotInitialized);
    require!(pool.is_initialized, WrapError::PoolNotInitialized);

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

    // 3. Append commitment to Light state tree (compressed account)
    let system_start = system_accounts_offset as usize;
    let system_end = system_start + LIGHT_SYSTEM_ACCOUNTS_LEN;
    require!(
        ctx.remaining_accounts.len() >= system_end,
        WrapError::InvalidTreeConfig
    );

    let mut light_accounts: Vec<AccountInfo<'info>> = Vec::with_capacity(LIGHT_SYSTEM_ACCOUNTS_LEN + 4);
    light_accounts.extend_from_slice(&ctx.remaining_accounts[system_start..system_end]);
    light_accounts.push(ctx.accounts.address_tree.to_account_info());
    if ctx.accounts.address_queue.key() != ctx.accounts.address_tree.key() {
        light_accounts.push(ctx.accounts.address_queue.to_account_info());
    }
    light_accounts.push(ctx.accounts.state_queue.to_account_info());
    light_accounts.push(ctx.accounts.state_tree.to_account_info());

    msg!(
        "debug: light system offset={} remaining={} system_slice={} packed_accounts={}",
        system_accounts_offset,
        ctx.remaining_accounts.len(),
        LIGHT_SYSTEM_ACCOUNTS_LEN,
        light_accounts.len() - LIGHT_SYSTEM_ACCOUNTS_LEN
    );
    msg!(
        "debug: address_tree {} writable={}",
        ctx.accounts.address_tree.key(),
        ctx.accounts.address_tree.is_writable
    );
    msg!(
        "debug: address_queue {} writable={}",
        ctx.accounts.address_queue.key(),
        ctx.accounts.address_queue.is_writable
    );
    msg!(
        "debug: state_queue {} writable={}",
        ctx.accounts.state_queue.key(),
        ctx.accounts.state_queue.is_writable
    );
    msg!(
        "debug: state_tree {} writable={}",
        ctx.accounts.state_tree.key(),
        ctx.accounts.state_tree.is_writable
    );
    for (i, account_info) in light_accounts
        .iter()
        .enumerate()
        .skip(LIGHT_SYSTEM_ACCOUNTS_LEN)
    {
        msg!(
            "debug: packed[{}] {} writable={}",
            i - LIGHT_SYSTEM_ACCOUNTS_LEN,
            account_info.key(),
            account_info.is_writable
        );
    }

    let light_cpi_accounts =
        CpiAccounts::new(ctx.accounts.user.as_ref(), &light_accounts, crate::LIGHT_CPI_SIGNER);

    let address_tree_pubkey = address_tree_info
        .get_tree_pubkey(&light_cpi_accounts)
        .map_err(|_| WrapError::InvalidTreeConfig)?;

    let (address, address_seed) = derive_address(
        &[b"commitment", &commitment],
        &address_tree_pubkey,
        &crate::ID,
    );

    let mut commitment_account = LightAccount::<CommitmentAccount>::new_init(
        &crate::ID,
        Some(address),
        output_state_tree_index,
    );
    commitment_account.commitment = commitment;

    LightSystemProgramCpi::new_cpi(crate::LIGHT_CPI_SIGNER, proof)
        .with_light_account(commitment_account)?
        .with_new_addresses(&[
            address_tree_info.into_new_address_params_assigned_packed(address_seed, Some(0)),
        ])
        .invoke(light_cpi_accounts)?;

    emit!(WrapEvent {
        user: ctx.accounts.user.key(),
        spl_mint: vault.spl_token_mint,
        inco_mint: vault.inco_token_mint,
        amount,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct WrapAndCommit<'info> {
    #[account(
        constraint = shielded_pool.spl_token_mint == spl_token_mint.key(),
        constraint = shielded_pool.inco_token_mint == inco_token_mint.key()
    )]
    pub shielded_pool: Account<'info, ShieldedPoolConfig>,

    #[account(
        mut,
        seeds = [b"vault", spl_token_mint.key().as_ref(), inco_token_mint.key().as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,

    pub spl_token_mint: Account<'info, Mint>,
    #[account(mut)]
    pub inco_token_mint: Account<'info, inco_token::IncoMint>,

    #[account(mut)]
    pub user_spl_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
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

    /// CHECK: Light address tree (mut)
    #[account(mut)]
    pub address_tree: AccountInfo<'info>,
    /// CHECK: Light address queue (mut)
    #[account(mut)]
    pub address_queue: AccountInfo<'info>,
    /// CHECK: Light state queue (mut)
    #[account(mut)]
    pub state_queue: AccountInfo<'info>,
    /// CHECK: Light state tree (mut)
    #[account(mut)]
    pub state_tree: AccountInfo<'info>,

}
