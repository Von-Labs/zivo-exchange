use anchor_lang::prelude::*;

#[error_code]
pub enum OrderbookError {
    #[msg("Invalid side")]
    InvalidSide,
    #[msg("Invalid escrow ciphertext")]
    InvalidEscrowCiphertext,
    #[msg("Counterparty does not match resting order owner")]
    CounterpartyMismatch,
    #[msg("Order slot already occupied")]
    OrderSlotOccupied,
    #[msg("Match already settled")]
    MatchAlreadySettled,
    #[msg("Invalid Inco program owner")]
    InvalidIncoProgramOwner,
    #[msg("Invalid Inco account data")]
    InvalidIncoAccountData,
    #[msg("Invalid Inco mint data")]
    InvalidIncoMintData,
    #[msg("Invalid Inco account owner field")]
    InvalidIncoAccountOwner,
    #[msg("Invalid Inco account mint")]
    InvalidIncoAccountMint,
}
