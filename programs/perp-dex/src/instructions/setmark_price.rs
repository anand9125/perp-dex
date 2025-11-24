use anchor_lang::prelude::*;

use crate::MarketState;

#[derive(Accounts)]
pub struct SetMarkPrice<'info> {
    #[account(mut)]
    pub market : Account<'info,MarketState>,
}
impl <'info> SetMarkPrice<'info>{
    pub fn process(
        &mut self,
        mark_price:u64
    )->Result<()>{
        let market = &mut self.market;
        market.last_oracle_price = mark_price as i64;
        Ok(())
    }
}