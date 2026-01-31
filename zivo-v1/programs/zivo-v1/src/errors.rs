use anchor_lang::prelude::*;

#[error_code]
pub enum OrderbookError {
    #[msg("Invalid side")]
    InvalidSide,
    #[msg("Invalid escrow ciphertext")]
    InvalidEscrowCiphertext,
    #[msg("Counterparty does not match resting order owner")]
    CounterpartyMismatch,
    #[msg("Order is closed")]
    OrderClosed,
    #[msg("Unauthorized matcher")]
    UnauthorizedMatcher,
    #[msg("Price mismatch")]
    PriceMismatch,
    #[msg("Order remaining amount is not zero")]
    RemainingNotZero,
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
    #[msg("Invalid order PDA")]
    InvalidOrderPda,
    #[msg("Invalid order owner")]
    InvalidOrderOwner,
    #[msg("Order is still open")]
    OrderStillOpen,
    #[msg("Order is not filled")]
    OrderNotFilled,
    #[msg("Order already claimed")]
    OrderAlreadyClaimed,
}
