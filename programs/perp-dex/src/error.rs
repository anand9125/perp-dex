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
    SlabFull,
    #[msg("Invalid Tree")]
    InvalidTree,
    #[msg("Invalid node type")]
    InvalidNodeType,
    #[msg("Node is root")]
    NodeIsRoot,
    #[msg("Node not found")]
    NodeNotFound,
    #[msg("Order not found")]
    OrderNotFound,
    #[msg("Queue is Empty")]
    QueueEmpty,
    #[msg("Math overflow")]
    MathOverflow
}
