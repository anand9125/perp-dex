use anchor_lang::{prelude::*};

use anchor_spl::{
    token::{ Token},
    associated_token::AssociatedToken,
};
use crate::{BidAsk, EventQueue, MAX_TO_PROCESS, MarketState, MatchingEngine,  RequestQueue, RequestType};

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
impl <'info> ProcessOrder<'info> {
    pub fn process(
        &mut self
    )->Result<()>{
      let processed = 0;

    while self.request_queue.count > 0 && processed < MAX_TO_PROCESS {
         let request = {
            let rq = &mut self.request_queue;
            rq.pop()?
        };
        match request {
            RequestType::Place(place_order)=>{
                MatchingEngine::process_place_order(self, place_order)?; 
            }
            RequestType::Cancel(cancel_order)=>{
                MatchingEngine::process_cancel_order( self, cancel_order)?;
            }
            
        }
          // FIXED
        let _ = processed.wrapping_add(1);
    }

    Ok(())
    }
    
}
