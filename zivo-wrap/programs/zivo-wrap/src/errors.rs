use anchor_lang::prelude::*;

#[error_code]
pub enum WrapError {
    #[msg("Vault is not initialized")]
    VaultNotInitialized,
    #[msg("Invalid SPL token mint")]
    InvalidMint,
    #[msg("Invalid Inco token mint")]
    InvalidIncoMint,
    #[msg("Insufficient balance")]
    InsufficientBalance,
}
