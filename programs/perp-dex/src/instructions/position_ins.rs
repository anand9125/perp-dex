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
    /// Process fill events from the global event queue that belong to this user.
    /// Only consumes events at the head that are for `user_key`; if the head is for another user, returns `EventNotForUser`.
    /// May process multiple consecutive events for the same user in one call.
    pub fn process(&mut self, user_key: Pubkey) -> Result<()> {
        require!(user_key == self.user_position.owner, PerpError::Unauthorized);

        let mut processed = 0;
        let max_per_call = 16u16; // cap events per instruction

        loop {
            if processed >= max_per_call {
                break;
            }
            let mut queue = self.event_queue.load_mut()?;
            if queue.count == 0 {
                return Ok(());
            }
            let ev = queue.peek()?;
            // Only consume events that belong to this user
            if ev.user != user_key.to_bytes() {
                return Err(error!(PerpError::EventNotForUser));
            }
            let fill_event = queue.pop()?;
            drop(queue);

            PositionManager::apply_fill(
                &mut self.market,
                &mut self.user_position,
                &mut self.user_collateral,
                fill_event,
            )?;
            processed += 1;
        }

        Ok(())
    }
}