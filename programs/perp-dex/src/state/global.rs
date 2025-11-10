use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct GlobalConfig{
    pub authority:Pubkey,
    pub vault_quote:Pubkey,
    pub insurance_fund : Pubkey,
    pub fee_pool :Pubkey,
    pub request_queue : Pubkey,
    pub event_queue : Pubkey,
    pub trading_paused : bool,
    pub im_bps_default:u16,
    pub mm_bps_default:u16,
    pub taker_fee_bps :u16,
    pub maker_fee_bps : u16,
    pub liq_penalty_bps:u16,//percentage charged when a user is liquidated. Often part goes to liquidators, part to the insurance fund.
    pub oracle_band_bps: u16,  //oracle_band_bps defines the maximum allowed difference after that trading will stop and perp price stay between these 
    pub funding_interval_secs :u32,  //How often the funding rate updates usually every 1-8 hours
    pub bump:u8
}