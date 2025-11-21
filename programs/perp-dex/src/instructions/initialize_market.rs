use anchor_lang::prelude::*;
use anchor_spl::{
    token::{ Token},
    associated_token::AssociatedToken,
};

use crate::{ASK_SLAB_CAPACITY, BID_SLAB_CAPACITY, BidAsk, EventQueue, MarketParams, MarketState, PerpError, RequestQueue, Slab};

#[derive(Accounts)]
#[instruction(market_symbol: Vec<u8>)]
pub struct InitializeMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

   #[account(
    init_if_needed,
    payer = authority,
    space = 8 + MarketState::INIT_SPACE,
    seeds = [b"market", market_symbol.as_slice()],
    bump
    )]
    pub market: Account<'info, MarketState>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + Slab::compute_allocation_size(BID_SLAB_CAPACITY),
        seeds = [b"bids", market_symbol.as_slice()],
        bump
    )]
    pub bids: Account<'info, BidAsk>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + Slab::compute_allocation_size(ASK_SLAB_CAPACITY),
        seeds = [b"asks", market_symbol.as_slice()],
        bump
    )]
    pub asks: Account<'info, BidAsk>,

    #[account(mut, seeds = [b"request_queue"], bump)]
    pub request_queue: Account<'info, RequestQueue>,

    #[account(mut, seeds = [b"event_queue"], bump)]
    pub event_queue: Account<'info, EventQueue>,

    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
}


impl<'info> InitializeMarket<'info> {
    pub fn process(
        &mut self,
        market_symbol: Vec<u8>,
        params: MarketParams,
        bump: &InitializeMarketBumps,
    ) -> Result<()> {

        let symbol = String::from_utf8(market_symbol)
            .map_err(|_| PerpError::InvalidSymbol)?;

        let market = &mut self.market;

        require!(
            market.authority == Pubkey::default()
                || market.authority == self.authority.key(),
            PerpError::NotAuthorized
        );
        let bid_account_info = &mut self.bids.to_account_info();
        let ask_account_info = &mut self.asks.to_account_info();

        market.symbol = symbol;
        market.authority = self.authority.key();

        market.oracle_pubkey = params.oracle_pubkey;
        market.last_oracle_price = params.last_oracle_price;
        market.last_oracle_ts = params.last_oracle_ts;

        market.im_bps = params.im_bps;
        market.mm_bps = params.mm_bps;
        market.oracle_band_bps = params.oracle_band_bps;

        market.taker_fee_bps = params.taker_fee_bps;
        market.maker_fee_bps = params.maker_rebate_bps;

        market.liq_penalty_bps = params.liq_penalty_bps;
        market.liquidator_share_bps = params.liquidator_share_bps;

        market.max_funding_rate = params.max_funding_rate;
        market.cum_funding = params.cum_funding;
        market.last_funding_ts = params.last_funding_ts;
        market.funding_interval_secs = params.funding_interval_secs;

        market.tick_size = params.tick_size;
        market.step_size = params.step_size;
        market.min_order_notional = params.min_order_notional;

        market.bid = self.bids.key();
        market.asks = self.asks.key();

        market.bump = bump.market;

        // Initialize slabs
           {
            let mut bid_data = bid_account_info.try_borrow_mut_data()?;//we are accesing underlaying bytes of this account
            let data_ref: &mut[u8] = &mut **bid_data;
            Slab::initializ(data_ref,BID_SLAB_CAPACITY)?;
        }
        {
            let mut ask_data = ask_account_info.try_borrow_mut_data()?;
            let data_ref: &mut[u8] = &mut **ask_data;
            Slab::initializ(data_ref,ASK_SLAB_CAPACITY)?;
        }

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