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



#[account]
#[derive(InitSpace)]
pub struct  MatchedOrder{
   pub order_id : u16,
   pub side : Side,
   pub qty : u8,
   pub order_type :OrderType,
   pub initial_margin : u64,
   pub leverage : u8,
   pub market : Pubkey
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