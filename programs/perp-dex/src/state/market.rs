use anchor_lang::prelude::*;

use crate::PerpError;

#[account]
#[derive(InitSpace)]
pub struct MarketState{
    #[max_len(16)]
    pub symbol:String,
    pub authority : Pubkey,
    pub oracle_pubkey : Pubkey,
    pub last_oracle_price : i64,
    pub last_oracle_ts : i64,

    pub bid : Pubkey,
    pub asks : Pubkey,
    pub event_queue : Pubkey,
    pub request_queue : Pubkey,
    // risk/fees (overrides)
    pub im_bps : u16,
    pub mm_bps :u16,
    pub taker_fee_bps : u16,
    pub oracle_band_bps :u16,

    pub cum_funding:i64,
    pub last_funding_ts :i64,
    pub max_funding_rate: i64,
    pub funding_interval_secs :u32,
    
    pub tick_size :u16,  //
    pub step_size :u8,  // the minimum quantity you can buy or sell in that market
    pub min_order_notional:u64,
    pub bump:u8

}

impl MarketState{
    pub fn get_mark_price(&self)->Result<u128>{
        //For simplicity using last oracle price as mark price
        if self.last_oracle_price <=0 {
            return Err(PerpError::InvalidAmount.into());
        }
        Ok(self.last_oracle_price as u128)
    }
}