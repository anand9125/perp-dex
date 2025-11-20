use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{ Token},
};
use crate::{EventQueue, MAX_TO_PROCESS, MarketState, Position, PositionManager, UserCollateral};

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
}

pub fn handler(mut ctx:Context<PositionIns>)->Result<()>{
   
        let processed:u16 = 0;
        let event_count =  ctx.accounts.event_queue.count;
        while event_count > 0 && processed< MAX_TO_PROCESS{
            let event ={
                let eq = &mut ctx.accounts.event_queue;
                eq.pop()?
            };
            PositionManager::apply_fill(
                 &mut ctx.accounts,
                event
            )?;
            processed.wrapping_add(1);

        }
        Ok(())
 }
    
