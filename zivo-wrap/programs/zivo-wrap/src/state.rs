use anchor_lang::prelude::*;
use light_sdk::{LightDiscriminator, LightHasher};

#[account]
pub struct Vault {
    pub authority: Pubkey,
    pub spl_token_mint: Pubkey,
    pub inco_token_mint: Pubkey,
    pub vault_token_account: Pubkey,
    pub is_initialized: bool,
    pub bump: u8,
}

impl Vault {
    pub const LEN: usize = 32 + 32 + 32 + 32 + 1 + 1;
}

#[event]
pub struct WrapEvent {
    pub user: Pubkey,
    pub spl_mint: Pubkey,
    pub inco_mint: Pubkey,
    pub amount: u64,
}

#[event]
pub struct UnwrapEvent {
    pub user: Pubkey,
    pub spl_mint: Pubkey,
    pub inco_mint: Pubkey,
    pub amount: u64,
}

#[account]
pub struct ShieldedPoolConfig {
    pub authority: Pubkey,
    pub vault: Pubkey,
    pub spl_token_mint: Pubkey,
    pub inco_token_mint: Pubkey,
    pub state_tree: Pubkey,
    pub address_tree: Pubkey,
    pub nullifier_queue: Pubkey,
    pub tree_depth: u8,
    pub is_initialized: bool,
    pub bump: u8,
}

impl ShieldedPoolConfig {
    pub const LEN: usize = 32 + 32 + 32 + 32 + 32 + 32 + 32 + 1 + 1 + 1;
}

#[event]
#[derive(Clone, Debug, Default, LightDiscriminator, LightHasher)]
pub struct CommitmentAccount {
    #[hash]
    pub commitment: [u8; 32],
}

#[event]
#[derive(Clone, Debug, Default, LightDiscriminator)]
pub struct NullifierAccount {}
