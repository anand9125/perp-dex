use anchor_lang::prelude::*;
use crate::{ASK_SLAB_CAPACITY, BID_SLAB_CAPACITY, BidAsk, MarketState, NODE_SIZE, SLAB_HEADER_LEN, Slab};

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
            msg!("RESET: Bid account total length: {}", bid_data.len());

            let slab_data: &mut [u8] = &mut bid_data[DISCRIMINATOR_LEN..];
            msg!("RESET: Bid slab raw data length: {}", slab_data.len());

            let capacity = (slab_data.len() - SLAB_HEADER_LEN) / NODE_SIZE;
            msg!("RESET: BIDS dynamic capacity={}", capacity);

            Slab::initialize(slab_data, capacity)?;
            msg!("RESET: Bid slab initialized successfully");
        }

        {
            let mut ask_data = ask_account_info.try_borrow_mut_data()?;
            msg!("RESET: Ask account total length: {}", ask_data.len());

            let slab_data: &mut [u8] = &mut ask_data[DISCRIMINATOR_LEN..];
            msg!("RESET: Ask slab raw data length: {}", slab_data.len());

            let capacity = (slab_data.len() - SLAB_HEADER_LEN) / NODE_SIZE;
            msg!("RESET: ASKS dynamic capacity={}", capacity);

            Slab::initialize(slab_data, capacity)?;
            msg!("RESET: Ask slab initialized successfully");
        }

        msg!("RESET: Both slabs initialized successfully");
        Ok(())
    }
}
