use anchor_lang::prelude::*;

use crate::{Order, PerpError};

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
  
    // risk/fees (overrides)
    pub im_bps : u16,
    pub mm_bps :u16,

    pub taker_fee_bps :u16,
    pub maker_fee_bps : u16,
    pub liquidator_share_bps :u16, //percentage of the liquidation penalty that goes to the liquidator
    pub liq_penalty_bps:u16,//percentage charged when a user is liquidated. Often part goes to liquidators, part to the insurance fund.
    pub oracle_band_bps: u16,  //oracle_band_bps defines the maximum allowed difference after that trading will stop and perp price stay between these 

    pub cum_funding:i64,
    pub last_funding_ts :i64,
    pub max_funding_rate: i64,
    pub funding_interval_secs :u32,
    
    pub tick_size :u16,  
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
    pub fn compute_initial_margin(&self,order:Order)->Result<u128>{
        let mark_price = self.get_mark_price()?;

        let notional = (order.qty as u128)
            .checked_mul(mark_price)
            .ok_or(PerpError::MathOverflow)?;

        require!(
            notional >= self.min_order_notional as u128,
            PerpError::OrderNotionalTooSmall
        );

        let im_bps = self.im_bps as u128;

        let im_required = notional
            .checked_mul(im_bps)
            .and_then(|v|v.checked_div(10000))
            .ok_or(PerpError::MathOverflow)?;

        Ok(im_required)   
    }
}





#[derive(AnchorDeserialize, AnchorSerialize)]
pub struct MarketParams {
    pub oracle_pubkey: Pubkey,
    pub last_oracle_price: i64,
    pub last_oracle_ts: i64,
    pub im_bps: u16,
    pub mm_bps: u16,
    pub oracle_band_bps: u16,
    pub taker_fee_bps: u16,
    pub maker_rebate_bps: u16,
    pub liq_penalty_bps: u16,
    pub liquidator_share_bps: u16,
    pub max_funding_rate: i64,
    pub cum_funding: i64,
    pub last_funding_ts: i64,
    pub funding_interval_secs: u32,
    pub tick_size: u16,
    pub step_size: u8,
    pub min_order_notional: u64,
}
