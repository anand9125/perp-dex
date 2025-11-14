use anchor_lang::prelude::*;

use crate::Order;


#[account]
#[derive(InitSpace)]
pub struct Position {
    // --- identity ---
    pub owner: Pubkey,         // trader's authority
    pub market: Pubkey,        // which market this belongs to
    pub order_id: u128,        // unique id for this trade 
   //we need to add sequesence that will generate here so that we can add in queseus and orderID

    // --- order intent ---
    pub side: Side,            // Buy or Sell
    pub price: u32,            // limit price (0 if market order)
    pub qty : u64,             // requested order size in base lots
    pub order_type: OrderType, // Market / Limit / Stop / etc.
    pub status: OrderStatus,   // Pending / Filled / Cancelled

    // --- position state ---
    pub base_position: i8,    // + long, - short (actual filled size)
    pub realized_pnl: i32,     // realized PnL from partial closes / funding
    pub last_cum_funding_long: i64,
    pub last_cum_funding_short: i64,
    pub initial_margin: u64,   // margin locked when opening
    pub leverage: u8,          // leverage used

    // --- bookkeeping ---
    pub flags: u32,            // reduce-only, liquidating, etc.
    pub created_at: i64,       // unix timestamp of creation
    pub updated_at: i64,       // last update timestamp
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace,PartialEq)]
pub enum OrderType {
    Market,
    Limit
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
#[derive(InitSpace)]

pub enum Side {
    Buy,
    Sell,
}


#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
#[derive(InitSpace)]

pub enum OrderStatus {
    Pending,        // order placed, not yet filled
    PartiallyFilled,// partially filled
    Filled,         // completely filled → active position
    Closed,         // position fully closed
    Cancelled,      // user cancelled before fill
}


