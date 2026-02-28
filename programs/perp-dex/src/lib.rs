pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;
pub mod utils;
pub mod engine;
pub mod event;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;
pub use error::*;
pub use utils::*;
pub use engine::*;
pub use event::*;


declare_id!("81dJfLhAbLPYQKbEHskyLvQdzbQffJzG9tVVfFRhpZ6p");

#[program]
pub mod perp_dex {

    use super::*;

    pub fn initalise_global_config(
        ctx: Context<InitializeGlobalConfig>,
        is_paused: bool,
        funding_interval_secs: u32,
    ) -> Result<()> {
        ctx.accounts.process(is_paused, funding_interval_secs, &ctx.bumps)?;
        Ok(())
    }

    pub fn initialize_market(
        ctx: Context<InitializeMarket>,
        market_symbol: Vec<u8>,
        params: MarketParams,
    ) -> Result<()> {
        ctx.accounts.process(market_symbol, params, &ctx.bumps)?;
        Ok(())
    }

    pub fn place_order(ctx: Context<PlaceOrder>, order: Order) -> Result<()> {
        ctx.accounts.process(order)?;
        Ok(())
    }
     
    pub fn set_mark_price(ctx: Context<SetMarkPrice>, mark_price: u64) -> Result<()> {
        ctx.accounts.process(mark_price)?;
        Ok(())
    }
    
    pub fn process_place_order(ctx: Context<ProcessOrder>) -> Result<()> {
        ctx.accounts.process()?;
        Ok(())
    }
    pub fn reset_queues(ctx: Context<ResetQueue>) -> Result<()> {
        ctx.accounts.process()?;
        Ok(())
    }
    pub fn reset_slab(ctx: Context<ResetOrderBook>) -> Result<()> {
        ctx.accounts.process()?;
        Ok(())
    }
    
    pub fn position_manager(ctx: Context<PositionIns>, user_key: Pubkey) -> Result<()> {
        ctx.accounts.process(user_key)?;
        Ok(())
    }

    pub fn liquidate(ctx: Context<Liquidation>) -> Result<()> {
        ctx.accounts.process()?;
        Ok(())
    }

    pub fn deposit_colletral(ctx: Context<DepositColletral>, amount: u64) -> Result<()> {
        ctx.accounts.process(amount)?;
        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, withdraw_amount: u64) -> Result<()> {
        ctx.accounts.process(withdraw_amount)?;
        Ok(())
    }

}
