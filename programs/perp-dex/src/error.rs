use anchor_lang::prelude::*;

#[error_code]
pub enum PerpError {
    #[msg("Custom error message")]
    CustomError,
    #[msg(" user is unauhtorized")]
    NotAuthorized,
    #[msg("Queue is full")]
    QueueFull,
    #[msg("Invalid quantity")]
    InvalidQuantity,
    #[msg("Invalid Amount")]
    InvalidAmount,
    #[msg("Insufficient Space")]
    InsufficientSpace,
    #[msg("Slab is full")]
    SlabFull


}
