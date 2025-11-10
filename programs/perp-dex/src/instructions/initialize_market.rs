use anchor_lang::prelude::*;
use anchor_spl::{
    token::{ Token},
    associated_token::AssociatedToken,
};

use crate::{BidAsk, MarketState, PerpError, RequestQueue,EventQueue};

#[derive(Accounts)]
#[instruction(market_symbol: String)]
pub struct InitializeMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + MarketState::INIT_SPACE,
        seeds = [b"market", market_symbol.as_bytes()],
        bump
    )]
    pub market: Account<'info, MarketState>,

    // TODO: Adjust sizes for bid/ask/queues as needed
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + BidAsk::INIT_SPACE,
        seeds = [b"bids", market_symbol.as_bytes()],
        bump
    )]
    pub bids: Account<'info, BidAsk>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + BidAsk::INIT_SPACE,
        seeds = [b"asks", market_symbol.as_bytes()],
        bump
    )]
    pub asks: Account<'info, BidAsk>,

    #[account(
        mut,
        seeds = [b"request_queue"],
        bump
    )]
    pub request_queue : Account<'info,RequestQueue>,
    #[account(
        mut,
        seeds = [b"event_queue"],
        bump
    )]
    pub event_queue : Account<'info,EventQueue>,

    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
}

impl<'info> InitializeMarket<'info> {
    pub fn process(
        &mut self,
        symbol : String,
        oracle_pubkey: Pubkey,
        last_oracle_price: i64,
        last_oracle_ts: i64,
        im_bps: u16,
        mm_bps : u16,
        taker_fee_bps: u16,
        oracle_band_bps: u16,
        cum_funding_long: i64,
        cum_funding_short: i64,
        last_funding_ts: i64,
        tick_size: u16,
        step_size: u8,
        min_order_notional: u64,
        bump:&InitializeMarketBumps
    ) -> Result<()> {
        let market = &mut self.market;

        require!(
            market.authority == Pubkey::default()
                || market.authority == self.authority.key(),
            PerpError::NotAuthorized
        );

        market.symbol = symbol;
        market.authority = self.authority.key();
        market.oracle_pubkey = oracle_pubkey;
        market.last_oracle_price = last_oracle_price;
        market.last_oracle_ts = last_oracle_ts;
        market.bid = self.bids.key();
        market.asks = self.asks.key();
        market.event_queue = self.event_queue.key();
        market.request_queue = self.request_queue.key();
        market.im_bps = im_bps;
        market.mm_bps = mm_bps;
        market.taker_fee_bps = taker_fee_bps;
        market.oracle_band_bps = oracle_band_bps;
        market.cum_funding_long = cum_funding_long;
        market.cum_funding_short = cum_funding_short;
        market.last_funding_ts = last_funding_ts;
        market.tick_size = tick_size;
        market.step_size = step_size;
        market.min_order_notional = min_order_notional;
        market.bump = bump.market;
        
        emit!(MarketInitialized {
            market: market.key(),
            symbol: market.symbol.clone(),
            authority: self.authority.key(),
        });
        Ok(())
    }
}

#[event]
pub struct MarketInitialized {
    pub market: Pubkey,
    pub symbol: String,
    pub authority: Pubkey,
}