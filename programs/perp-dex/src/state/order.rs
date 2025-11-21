use anchor_lang::prelude::*;

use crate::{OrderType, Side};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct Order {
   pub user : [u8; 32],
   pub order_id : u128,
   pub side : Side,
   pub qty : u64,
   pub order_type : OrderType,
   pub limit_price : u64,
   pub initial_margin : u64,
   pub leverage : u8,
   pub market : Pubkey,
}

impl Order {
    pub const SIZE: usize = 32 + 16 + 1 + 8 + 1 + 8 + 8 + 1 + 32; // = 107
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct CancelOrder {
   pub order_id: u128, 
   pub user: Pubkey,
   pub side: Side,
}

impl CancelOrder {
    pub const SIZE: usize = 16 + 32 + 1; // = 49
}

#[account]
pub struct MatchedOrder {
    pub is_maker: bool,
    pub order_id: u128,
    pub user: [u8;32],
    pub fill_price: u64,
    pub fill_qty: u64,
    pub side: Side,
    pub timestamp: i64,
}

impl MatchedOrder {
    pub const SIZE: usize = 80; // Borsh padded size
}
