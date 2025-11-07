use anchor_lang::prelude::*;

#[account]

pub struct Position{
    pub owner : Pubkey,
    pub market : Pubkey,
    pub base_position : i64,  //(The size of the position, in base asset “lots.”Positive = long Negative = short)
    pub realized_pnl : i64,
    pub last_cum_funding_long: i64,
    pub last_cum_funding_short: i64,
    

}