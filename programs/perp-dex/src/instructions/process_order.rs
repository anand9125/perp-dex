use anchor_lang::{prelude::*};

use anchor_spl::{
    token::{ Token},
    associated_token::AssociatedToken,
};
use crate::{BidAsk, EventQueue, MAX_TO_PROCESS, MarketState, MatchingEngine,  RequestQueue, RequestType, request_queue};

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
    pub request_queue : AccountLoader<'info, RequestQueue>,
    #[account(
        mut,
        seeds = [b"event_queue"],
        bump
    )]
    pub event_queue : AccountLoader<'info,EventQueue>,
    pub system_program : Program<'info,System>,
    pub associated_token_program : Program<'info, AssociatedToken>,
    pub token_program : Program<'info,Token>
}
impl <'info> ProcessOrder<'info> {
    pub fn process(
        &mut self
    )->Result<()>{
        let mut processed:u16 = 0;
        while processed < MAX_TO_PROCESS {
            let request_opt = {
                let mut rq = self.request_queue.load_mut()?;
                if rq.count == 0 {
                    None
                } else {
                    Some(rq.pop()?)
                }
            };
              match request_opt {
                Some(RequestType::Place(order)) => {
                    MatchingEngine::process_place_order(self, order)?;
                }
                Some(RequestType::Cancel(order)) => {
                    MatchingEngine::process_cancel_order(self, order)?;
                }
                None => break,
            }
               processed += 1;
        }
        Ok(())
    }
    
}
