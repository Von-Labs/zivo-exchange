use anchor_lang::prelude::*;
use light_sdk::cpi::CpiSigner;
use light_sdk::derive_light_cpi_signer;

pub mod errors;
pub mod instructions;
pub mod state;

pub use instructions::*;

declare_id!("hcapJFTKYpxHPFjewhgQ12W7Wi41XnxAAiC8hwUQLzz");

pub const LIGHT_CPI_SIGNER: CpiSigner =
    derive_light_cpi_signer!("hcapJFTKYpxHPFjewhgQ12W7Wi41XnxAAiC8hwUQLzz");

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

    pub fn init_shielded_pool(ctx: Context<InitShieldedPool>, tree_depth: u8) -> Result<()> {
        instructions::init_shielded_pool::handler(ctx, tree_depth)
    }

    pub fn wrap_and_commit<'info>(
        ctx: Context<'_, '_, '_, 'info, WrapAndCommit<'info>>,
        ciphertext: Vec<u8>,
        input_type: u8,
        amount: u64,
        commitment: [u8; 32],
        proof: light_sdk::instruction::ValidityProof,
        address_tree_info: light_sdk::instruction::PackedAddressTreeInfo,
        output_state_tree_index: u8,
        system_accounts_offset: u8,
    ) -> Result<()> {
        instructions::wrap_and_commit::handler(
            ctx,
            ciphertext,
            input_type,
            amount,
            commitment,
            proof,
            address_tree_info,
            output_state_tree_index,
            system_accounts_offset,
        )
    }

    pub fn shielded_transfer<'info>(
        ctx: Context<'_, '_, '_, 'info, ShieldedTransfer<'info>>,
        proof_data: Vec<u8>,
        nullifier: [u8; 32],
        new_commitment: [u8; 32],
        light_proof: light_sdk::instruction::ValidityProof,
        address_tree_info: light_sdk::instruction::PackedAddressTreeInfo,
        output_state_tree_index: u8,
        system_accounts_offset: u8,
    ) -> Result<()> {
        instructions::shielded_transfer::handler(
            ctx,
            proof_data,
            nullifier,
            new_commitment,
            light_proof,
            address_tree_info,
            output_state_tree_index,
            system_accounts_offset,
        )
    }

    pub fn unwrap_from_note<'info>(
        ctx: Context<'_, '_, '_, 'info, UnwrapFromNote<'info>>,
        proof_data: Vec<u8>,
        nullifier: [u8; 32],
        ciphertext: Vec<u8>,
        input_type: u8,
        plaintext_amount: u64,
        light_proof: light_sdk::instruction::ValidityProof,
        address_tree_info: light_sdk::instruction::PackedAddressTreeInfo,
        output_state_tree_index: u8,
        system_accounts_offset: u8,
    ) -> Result<()> {
        instructions::unwrap_from_note::handler(
            ctx,
            proof_data,
            nullifier,
            ciphertext,
            input_type,
            plaintext_amount,
            light_proof,
            address_tree_info,
            output_state_tree_index,
            system_accounts_offset,
        )
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
