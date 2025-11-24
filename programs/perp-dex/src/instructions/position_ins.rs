use anchor_lang::prelude::*;
use crate::{
    EventQueue,  MarketState, PerpError,
    Position, PositionManager, UserCollateral
};
use anchor_spl::token::Token;

#[derive(Accounts)]
#[instruction(user_key : Pubkey)]
pub struct PositionIns<'info> {
    #[account(
        mut,
        seeds = [b"market", market.symbol.as_bytes()],
        bump
    )]
    pub market: Account<'info, MarketState>,

    #[account(
        mut,
        seeds = [b"position", market.symbol.as_bytes(), user_key.as_ref()],
        bump
    )]
    pub user_position: Account<'info, Position>,

    #[account(
        mut,
        seeds = [b"event_queue"],
        bump
    )]
    pub event_queue: AccountLoader<'info, EventQueue>,

    #[account(
        mut,
        seeds = [b"user_colletral", user_key.as_ref()],
        bump
    )]
    pub user_collateral: Account<'info, UserCollateral>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>
}

impl<'info> PositionIns<'info> {
    pub fn process(&mut self, user_key: Pubkey) -> Result<()> {
        let fill_event = {
            let mut queue = self.event_queue.load_mut()?;
            if queue.count == 0 {
                return Err(error!(PerpError::QueueEmpty));
            }
            queue.pop()?
        };

        // Security: ensure correct user consuming event

        PositionManager::apply_fill(
            &mut self.market,
            &mut self.user_position,
            &mut self.user_collateral,
            fill_event,
        )
    }
}
