use anchor_lang::prelude::*;

#[error_code]
pub enum PerpError {
    #[msg("Custom error message")]
    CustomError,
    #[msg(" user is unauthorized")]
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
    MathOverflow,
    #[msg("Nothing to liquidate")]
    NothingToLiquidate,
    #[msg("Invalid Oracle Price")]
    InvalidOraclePrice,
    #[msg("Invalid Timestamp")]
    InvalidTimestamp,
    #[msg("Invalid Market Config")]
    InvalidMarketConfig,
    #[msg("Funding not due yet")]
    FundingNotDue,
    #[msg("Order notional too small")]
    OrderNotionalTooSmall,
    #[msg("Insufficient collateral")]
    InsufficientCollateral,
    #[msg("Withdraw Would Liquidate")]
    WithdrawWouldLiquidate,
    #[msg("InvalidSymbol")]
    InvalidSymbol,
    #[msg("SerializationFailed")]
    SerializationFailed,
    #[msg("DeserializationFailed")]
    DeserializationFailed,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Event at head of queue is for another user")]
    EventNotForUser,
    #[msg("InvalidVaultQuoteMint ")]
    InvalidVaultQuoteMint 
}

