use anchor_lang::prelude::*;
use crate::{BidAsk, MarketState, NODE_SIZE, SLAB_HEADER_LEN, Slab};

 pub const DISCRIMINATOR_LEN: usize = 8;

#[derive(Accounts)]
pub struct ResetOrderBook<'info> {
    #[account(mut, seeds=[b"bids", market.symbol.as_bytes()], bump)]
    pub bids: AccountLoader<'info, BidAsk>,
    #[account(mut, seeds=[b"asks", market.symbol.as_bytes()], bump)]
    pub asks: AccountLoader<'info, BidAsk>,
    pub market: Account<'info, MarketState>,
}

impl<'info> ResetOrderBook<'info> {
    pub fn process(&mut self) -> Result<()> {
        msg!("RESET: Starting bid slab initialization");
        let bid_account_info = self.bids.to_account_info();
        let ask_account_info = self.asks.to_account_info();

        {
            let mut bid_data = bid_account_info.try_borrow_mut_data()?;
            let slab_data: &mut [u8] = &mut bid_data[DISCRIMINATOR_LEN..];
            let capacity = (slab_data.len() - SLAB_HEADER_LEN) / NODE_SIZE;
            Slab::initialize(slab_data, capacity)?;
        }

        {
            let mut ask_data = ask_account_info.try_borrow_mut_data()?;
            let slab_data: &mut [u8] = &mut ask_data[DISCRIMINATOR_LEN..];
            let capacity = (slab_data.len() - SLAB_HEADER_LEN) / NODE_SIZE;
            Slab::initialize(slab_data, capacity)?;
        }

        msg!("RESET: Both slabs initialized successfully");
        Ok(())
    }
}
