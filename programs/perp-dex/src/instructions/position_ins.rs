use anchor_lang::prelude::*;

use crate::{EventQueue, MAX_TO_PROCESS, MarketState, Position, PositionManager, UserCollateral};
use anchor_spl::{
    token::{ Token},
    associated_token::AssociatedToken,
};
#[derive(Accounts)]
#[instruction(user_key : Pubkey)]
pub struct PositionIns<'info>{
    #[account(
        mut,
        seeds = [b"market",market.symbol.as_bytes()],
        bump
    )]
    pub market : Account<'info,MarketState>,
    #[account(
        mut,
        seeds = [b"position", market.symbol.as_bytes(), user_key.as_ref()],
        bump
    )]
    pub user_position: Account<'info,Position>,
    #[account(
        mut,
        seeds = [b"event_queue"],
        bump
    )]
    pub event_queue : Account<'info,EventQueue>,
      #[account(
        mut,
        seeds = [b"user_colletral", user_position.owner.key().as_ref()],
        bump
    )]
    pub user_colletral : Account<'info,UserCollateral>,
    pub system_program : Program<'info,System>,
    pub associated_token_program : Program<'info, AssociatedToken>,
    pub token_program : Program<'info,Token>

}
    
impl <'info> PositionIns<'info>{
    pub fn process(
        &mut self
    )->Result<()>{
        let processed:u16 = 0;
        let event_count =  self.event_queue.count;
        while event_count > 0 && processed< MAX_TO_PROCESS{
            let event ={
                let eq = &mut self.event_queue;
                eq.pop()?
            };
            PositionManager::apply_fill(
                 self,
                event
            )?;
           let _= processed.wrapping_add(1);

        }
        Ok(())
    }

}
