use anchor_lang::prelude::*;

use crate::{ASK_SLAB_CAPACITY, BID_SLAB_CAPACITY, BidAsk, MarketState, Slab};

#[derive(Accounts)]
pub struct ResetOrderBook<'info> {
    #[account(mut, seeds=[b"bids", market.symbol.as_bytes()], bump)]
    pub bids: AccountLoader<'info, BidAsk>,

    #[account(mut, seeds=[b"asks", market.symbol.as_bytes()], bump)]
    pub asks: AccountLoader<'info, BidAsk>,

    pub market: Account<'info, crate::MarketState>,
}

impl<'info> ResetOrderBook<'info> {
    pub fn process(&mut self) -> Result<()> {
        {
            let ai = self.bids.to_account_info();
            let mut data = ai.try_borrow_mut_data()?;
            let slab_bytes: &mut [u8] = &mut data[..];
            Slab::initialize(slab_bytes, BID_SLAB_CAPACITY)?;
        }
        {
            let ai = self.asks.to_account_info();
            let mut data = ai.try_borrow_mut_data()?;
            let slab_bytes: &mut [u8] = &mut data[..];
            Slab::initialize(slab_bytes, ASK_SLAB_CAPACITY)?;
        }
        Ok(())
    }
}

