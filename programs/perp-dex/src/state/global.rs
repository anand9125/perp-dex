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
    pub funding_interval_secs :u32,  //How often the funding rate updates usually every 1-8 hours
    pub bump:u8
}