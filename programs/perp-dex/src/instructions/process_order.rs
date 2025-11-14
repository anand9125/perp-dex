use anchor_lang::{prelude::*};

use anchor_spl::{
    token::{ Token},
    associated_token::AssociatedToken,
};
use crate::{BidAsk, EventQueue, MAX_TO_PROCESS, MarketState, MatchingEngine, Order, OrderType, PerpError, RequestQueue, RequestType, Side, Slab};

#[derive(Accounts)]
#[instruction(market_symbol:String)]
pub struct ProcessOrder <'info>{
    #[account(mut)]
    pub authority : Signer<'info>,
    #[account(
        mut,
        seeds = [b"bids",market_symbol.as_bytes()],
        bump
    )]
    pub bids : Account<'info,BidAsk>,
    #[account(
        mut,
        seeds = [b"ask",market_symbol.as_bytes()],
        bump
    )]
    pub asks : Account<'info, BidAsk>,
    #[account(
        mut,
        seeds = [b"market",market_symbol.as_bytes()],
        bump
    )]
    pub market : Account<'info,MarketState>,
    #[account(
        mut,
        seeds = [b"request_queue"],
        bump
    )]
    pub request_queue : Account<'info, RequestQueue>,
    #[account(
        mut,
        seeds = [b"event_queue"],
        bump
    )]
    pub event_queue : Account<'info,EventQueue>,
    pub system_program : Program<'info,System>,
    pub associated_token_program : Program<'info, AssociatedToken>,
    pub token_program : Program<'info,Token>
}
pub fn handler(mut ctx: Context<ProcessOrder>) -> Result<()> {
    let mut processed = 0;

    while ctx.accounts.request_queue.count > 0 && processed < MAX_TO_PROCESS {
         let request = {
            let rq = &mut ctx.accounts.request_queue;
            rq.pop()?
        };
        match request {
            RequestType::Place(place_order)=>{
                MatchingEngine::process_place_order(&mut ctx.accounts, place_order)?; 
            }
            RequestType::Cancel(cancel_order)=>{
                MatchingEngine::process_cancel_order(&mut ctx.accounts, cancel_order)?;
            }
            
        }

          // FIXED
        processed += 1;
    }

    Ok(())
}


