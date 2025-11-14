use anchor_lang::prelude::*;

use crate::{ MAX_HISTOY, OrderType, Side, order};

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
    pub price: u64,
    pub qty: u64,
    pub side: Side,
    pub timestamp: i64,
}

#[account]
#[derive(InitSpace)]
pub struct OrderHistory {
   pub user : Pubkey,
   pub history : [Order;MAX_HISTOY],
   pub head : u64,
   pub count : u64,
   pub capacity : u64
}

impl OrderHistory {
   pub fn push_order (&mut self,order:Order){
      let idx = (self.head % self.capacity) as usize;
      self.history[idx] = order;
      self.head =(self.head+1) % self.capacity;
      if self.count <self.capacity{
         self.count += 1;
      }
   }
    
}