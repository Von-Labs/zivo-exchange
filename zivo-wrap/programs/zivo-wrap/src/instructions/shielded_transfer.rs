use anchor_lang::prelude::*;
use light_sdk::{
    account::LightAccount,
    address::v2::derive_address,
    cpi::{v2::CpiAccounts, LightCpiInstruction},
    instruction::{PackedAddressTreeInfo, ValidityProof},
};
use light_sdk::cpi::InvokeLightSystemProgram;
use light_sdk::cpi::v2::LightSystemProgramCpi;

use crate::errors::WrapError;
use crate::state::{CommitmentAccount, NullifierAccount, ShieldedPoolConfig};

const LIGHT_SYSTEM_ACCOUNTS_LEN: usize = 6;

pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, ShieldedTransfer<'info>>,
    proof_data: Vec<u8>,
    nullifier: [u8; 32],
    new_commitment: [u8; 32],
    light_proof: ValidityProof,
    address_tree_info: PackedAddressTreeInfo,
    output_state_tree_index: u8,
    system_accounts_offset: u8,
) -> Result<()> {
    let pool = &ctx.accounts.shielded_pool;
    require!(pool.is_initialized, WrapError::PoolNotInitialized);

    // 1. Verify Noir proof via external verifier program (Sunspot Groth16)
    // proof_data should contain proof + public inputs as expected by the verifier.
    let verify_ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: ctx.accounts.verifier_program.key(),
        accounts: vec![],
        data: proof_data,
    };
    anchor_lang::solana_program::program::invoke(&verify_ix, &[])?;

    // 2. Append nullifier + new commitment to Light state tree
    let system_start = system_accounts_offset as usize;
    let system_end = system_start + LIGHT_SYSTEM_ACCOUNTS_LEN;
    require!(
        ctx.remaining_accounts.len() >= system_end,
        WrapError::InvalidTreeConfig
    );

    let mut light_accounts: Vec<AccountInfo<'info>> = Vec::with_capacity(LIGHT_SYSTEM_ACCOUNTS_LEN + 5);
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

    let (nullifier_address, nullifier_seed) = derive_address(
        &[b"nullifier", &nullifier],
        &address_tree_pubkey,
        &crate::ID,
    );
    let (commitment_address, commitment_seed) = derive_address(
        &[b"commitment", &new_commitment],
        &address_tree_pubkey,
        &crate::ID,
    );

    let nullifier_account = LightAccount::<NullifierAccount>::new_init(
        &crate::ID,
        Some(nullifier_address),
        output_state_tree_index,
    );

    let mut commitment_account = LightAccount::<CommitmentAccount>::new_init(
        &crate::ID,
        Some(commitment_address),
        output_state_tree_index,
    );
    commitment_account.commitment = new_commitment;

    LightSystemProgramCpi::new_cpi(crate::LIGHT_CPI_SIGNER, light_proof)
        .with_light_account(nullifier_account)?
        .with_light_account(commitment_account)?
        .with_new_addresses(&[
            address_tree_info.into_new_address_params_assigned_packed(nullifier_seed, Some(0)),
            address_tree_info.into_new_address_params_assigned_packed(commitment_seed, Some(1)),
        ])
        .invoke(light_cpi_accounts)?;

    Ok(())
}

#[derive(Accounts)]
pub struct ShieldedTransfer<'info> {
    #[account(mut)]
    pub shielded_pool: Account<'info, ShieldedPoolConfig>,

    #[account(mut)]
    pub user: Signer<'info>,

    /// CHECK: Noir verifier program (Sunspot Groth16)
    pub verifier_program: AccountInfo<'info>,

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
