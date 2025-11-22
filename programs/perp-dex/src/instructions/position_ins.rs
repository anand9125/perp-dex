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
    pub event_queue : AccountLoader<'info,EventQueue>,
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
        let mut processed:u16 = 0;
        while processed < MAX_TO_PROCESS {
            let event_opt = {
                let mut eq = self.event_queue.load_mut()?;
                if eq.count == 0 {
                    None
                } else {
                    Some(eq.pop()?)
                }
            };
            match event_opt {
                Some(event) => {
                    PositionManager::apply_fill(
                        self,
                        event
                    )?;
                }
                None => break,
            }
            processed += 1;
        };
        Ok(())
    }

}
