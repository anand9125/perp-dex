use anchor_lang::prelude::*;

use crate::{  OrderType, Side, order};

#[account]
#[derive(InitSpace)]
pub struct  Order{
   pub user : [u8; 32],
   pub order_id : u128,
   pub side : Side,
   pub qty : u64,
   pub order_type :OrderType,
   pub limit_price : u64,
   pub initial_margin : u64,
   pub leverage : u8,
   pub market : Pubkey,
}
#[derive(AnchorSerialize, AnchorDeserialize, Clone,InitSpace)]
pub struct CancelOrder {
   pub order_id: u128, 
   pub user: Pubkey ,
   pub side: Side
}


#[account]
#[derive(InitSpace)]
pub struct MatchedOrder {
    pub is_maker: bool,
    pub order_id: u128,
    pub user: [u8;32],
    pub fill_price: u64,
    pub fill_qty: u64,
    pub side: Side,
    pub timestamp: i64,
}
