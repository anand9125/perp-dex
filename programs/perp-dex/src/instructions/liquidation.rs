use anchor_lang::{prelude::*};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};
use crate::{
    BidAsk, EventQueue, FUNDING_SCALE, GlobalConfig, MarketState, MatchingType, Order, OrderType, PerpError, Position, Ratio, RiskEngine, Side, UserCollateral, match_against_book,
};

#[derive(Accounts)]
pub struct Liquidation<'info> {
    #[account(mut)]
    pub liquidator: Signer<'info>,

    #[account(
        mut,
        constraint = liquidator_token_account.mint == usdc_mint.key(),
        constraint = liquidator_token_account.owner == liquidator.key()
    )]
    pub liquidator_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"market", market.symbol.as_bytes()],
        bump
    )]
    pub market: Account<'info, MarketState>,

    #[account(
        mut,
        seeds = [b"bids", market.symbol.as_bytes()],
        bump
    )]
    pub bids: Account<'info, BidAsk>,

    #[account(
        mut,
        seeds = [b"asks", market.symbol.as_bytes()],
        bump
    )]
    pub ask: Account<'info, BidAsk>,

    #[account(
        mut,
        seeds = [b"event_queue"],
        bump
    )]
    pub event_queue: Account<'info, EventQueue>,

    
    #[account(
        mut,
        seeds = [b"position", market.symbol.as_bytes(), liquidatee_position.owner.as_ref()],
        bump
    )]
    pub liquidatee_position: Account<'info, Position>,
    #[account(
        mut,
        seeds = [b"user_colletral", liquidatee_position.owner.as_ref()],
        bump
    )]
    pub liquidatee_user_collateral: Account<'info, UserCollateral>,

    #[account(
        mut,
        constraint = liquidatee_token_account.mint == usdc_mint.key(),
        constraint = liquidatee_token_account.owner == liquidatee_position.owner
    )]
    pub liquidatee_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"global_config"],
        bump
    )]
    pub global_config: Account<'info, GlobalConfig>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = insurance_fund.mint == usdc_mint.key(),
        constraint = insurance_fund.owner == global_config.key()
    )]
    pub insurance_fund: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = vault_quote.mint == usdc_mint.key(),
        constraint = vault_quote.owner == global_config.key()
    )]
    pub vault_quote: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
}

impl<'info> Liquidation<'info> {
    pub fn process(&mut self) -> Result<()> {

        let bids = &mut self.bids;
        let asks = &mut self.ask;
        let market = &mut self.market;
        let target_pos = &mut self.liquidatee_position;
        let event_queue = &mut self.event_queue;
        let global_config = &mut self.global_config;
        let vault_quote = &mut self.vault_quote;
        let insurance_fund = &mut self.insurance_fund;
        let liquidator_token_account = &mut self.liquidator_token_account;
        let liquidatee_token_account = &mut self.liquidatee_token_account;
        let liquidatee_user_collateral = &mut self.liquidatee_user_collateral;

        require!(target_pos.base_position != 0, PerpError::NothingToLiquidate);

        // Apply funding (must happen before health check) 
        let pos_last_cum = target_pos.last_cum_funding;
        let delta_funding = market
            .cum_funding
            .checked_sub(pos_last_cum)
            .ok_or(PerpError::MathOverflow)?;

        let funding_payment = delta_funding
            .checked_mul(target_pos.base_position as i64)
            .and_then(|v| v.checked_div(FUNDING_SCALE as i64))
            .ok_or(PerpError::MathOverflow)?;

        target_pos.realized_pnl = target_pos
            .realized_pnl
            .checked_sub(funding_payment)
            .ok_or(PerpError::MathOverflow)?;
        liquidatee_user_collateral.collateral_amount = liquidatee_user_collateral
            .collateral_amount
            .checked_sub(funding_payment as i128)
            .ok_or(PerpError::MathOverflow)?;

        target_pos.last_cum_funding = market.cum_funding;

        //  Recompute health using updated realized_pnl means user_Colletrl 

        let collateral_i128 = liquidatee_user_collateral.collateral_amount;
        let mark_price = market.get_mark_price()?;
        let maintain_ratio = Ratio::from_bps(market.mm_bps);

        let health = RiskEngine::account_health_single(
            collateral_i128,
            target_pos.base_position as i128,
            target_pos.entry_price as u128,
            mark_price,
            maintain_ratio,
        )?;

        require!(health < 0, PerpError::NothingToLiquidate);

        //Build liquidation taker order 
        let position_qty_abs = target_pos.base_position.abs() as u64;
        let is_long = target_pos.base_position > 0;
        let liquidation_side = if is_long { Side::Sell } else { Side::Buy };

        let taker_order = Order {
            order_id: target_pos.order_id,
            user: target_pos.owner.to_bytes(),
            side: liquidation_side,
            qty: position_qty_abs,
            order_type: OrderType::Market,
            limit_price: 0,
            initial_margin: 0,
            leverage: 0,
            market: market.key(),
        };

        // Match against book / forced close remainder at mark 
        let (_remaining_qty, fills) = match liquidation_side {
            Side::Buy => {
                let ask_account_info = &mut asks.to_account_info();
                let mut ask_data = ask_account_info.try_borrow_mut_data()?;
                let ask_bytes: &mut [u8] = &mut **ask_data;
                let ask_slab = &mut crate::Slab::from_bytes_mut(ask_bytes)?;

                match_against_book(ask_slab, &taker_order, event_queue, MatchingType::Liquidation)?
            }
            Side::Sell => {
                let bid_account_info = &mut bids.to_account_info();
                let mut bid_data = bid_account_info.try_borrow_mut_data()?;
                let bid_bytes: &mut [u8] = &mut **bid_data;
                let bid_slab = &mut crate::Slab::from_bytes_mut(bid_bytes)?;

                match_against_book(bid_slab, &taker_order, event_queue, MatchingType::Liquidation)?
            }
        };

        let mut total_closed_notional: u128 = 0;
        let total_filled_qty: u64 = fills.iter().map(|f| f.fill_qty).sum();
        let mut exit_avg_price: u128 = 0;

        if !fills.is_empty() {
            for f in fills.iter() {
                let fill_notional = (f.fill_price as u128)
                    .checked_mul(f.fill_qty as u128)
                    .ok_or(PerpError::MathOverflow)?;
                total_closed_notional = total_closed_notional
                    .checked_add(fill_notional)
                    .ok_or(PerpError::MathOverflow)?;
            }
            exit_avg_price = total_closed_notional
                .checked_div(total_filled_qty as u128)
                .ok_or(PerpError::MathOverflow)?;
        }

        if _remaining_qty != 0 {
            // force close remainder at mark price
            let forced_notional = (mark_price as u128)
                .checked_mul(_remaining_qty as u128)
                .ok_or(PerpError::MathOverflow)?;
            total_closed_notional = total_closed_notional
                .checked_add(forced_notional)
                .ok_or(PerpError::MathOverflow)?;
            exit_avg_price = total_closed_notional
                .checked_div((total_filled_qty + _remaining_qty) as u128)
                .ok_or(PerpError::MathOverflow)?;
        }

        let realized_pnl = RiskEngine::realized_pnl(
            target_pos.base_position as i128,
            target_pos.entry_price as u128,
            exit_avg_price,
        )?;

        target_pos.realized_pnl = target_pos
            .realized_pnl
            .checked_add(realized_pnl as i64)
            .ok_or(PerpError::MathOverflow)?;

        liquidatee_user_collateral.collateral_amount = liquidatee_user_collateral
            .collateral_amount
            .checked_add(realized_pnl as i128)
            .ok_or(PerpError::MathOverflow)?;

        target_pos.base_position = 0;
        target_pos.entry_price = 0;
        target_pos.last_cum_funding = market.cum_funding;
        target_pos.updated_at = Clock::get()?.unix_timestamp;

        // Compute final equity and apply penalties/transfers
        let final_equity = liquidatee_user_collateral.collateral_amount;

        
        let liquidation_penalty_bps = market.liq_penalty_bps as u128;
        let liquidator_share_bps = market.liquidator_share_bps as u128;
        let bps_denominator: u128 = 10_000u128;

        let raw_penalty = total_closed_notional
            .checked_mul(liquidation_penalty_bps)
            .and_then(|v| v.checked_div(bps_denominator))
            .ok_or(PerpError::MathOverflow)?;

        // cap penalty to user's positive equity (if any). If final_equity <= 0, penalty is 0 and shortfall becomes bad debt.
        let capped_penalty_u128 = if final_equity > 0 {
            let final_equity_u128 = final_equity as u128;
            if raw_penalty > final_equity_u128 {
                final_equity_u128
            } else {
                raw_penalty
            }
        } else {
            0u128
        };

        let liquidator_reward = capped_penalty_u128
            .checked_mul(liquidator_share_bps)
            .and_then(|v| v.checked_div(bps_denominator))
            .ok_or(PerpError::MathOverflow)?;

        let insurance_fund_amount = capped_penalty_u128
            .checked_sub(liquidator_reward)
            .ok_or(PerpError::MathOverflow)?;

        // Transfer to liquidator (from vault) - use PDA signer of global_config
        let signer_seeds: &[&[u8]] = &[b"global_config", &[global_config.bump]];
        
        liquidatee_user_collateral.collateral_amount = liquidatee_user_collateral
            .collateral_amount
            .checked_sub(capped_penalty_u128 as i128)   
            .ok_or(PerpError::MathOverflow)?;

        // amounts must fit in u64 for token transfer
        let liquidator_reward_u64 = u64::try_from(liquidator_reward).map_err(|_| PerpError::MathOverflow)?;
        let insurance_fund_amount_u64 = u64::try_from(insurance_fund_amount).map_err(|_| PerpError::MathOverflow)?;

        if liquidator_reward_u64 > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    self.token_program.to_account_info(),
                    Transfer {
                        from: vault_quote.to_account_info(),
                        to: liquidator_token_account.to_account_info(),
                        authority: global_config.to_account_info(),
                    },
                    &[signer_seeds],
                ),
                liquidator_reward_u64,
            )?;
        }

        if insurance_fund_amount_u64 > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    self.token_program.to_account_info(),
                    Transfer {
                        from: vault_quote.to_account_info(),
                        to: insurance_fund.to_account_info(),
                        authority: global_config.to_account_info(),
                    },
                    &[signer_seeds],
                ),
                insurance_fund_amount_u64,
            )?;
        }
    
        // If negative, cover shortfall from insurance fund -> vault_quote. Otherwise pay user from vault.
        if liquidatee_user_collateral.collateral_amount < 0 {

            let shortfall_i128 = liquidatee_user_collateral.collateral_amount.checked_abs().ok_or(PerpError::MathOverflow)?;
            let shortfall_u128 = shortfall_i128 as u128;
            let shortfall_u64 = u64::try_from(shortfall_u128).map_err(|_| PerpError::MathOverflow)?;


            // Transfer from insurance_fund -> vault_quote to cover bad debt
            if shortfall_u64> 0 {
                token::transfer(
                    CpiContext::new_with_signer(
                        self.token_program.to_account_info(),
                        Transfer {
                            from: insurance_fund.to_account_info(),
                            to: vault_quote.to_account_info(),
                            authority: global_config.to_account_info(),
                        },
                        &[signer_seeds],
                    ),
                    shortfall_u64,
                )?;
            liquidatee_user_collateral.collateral_amount = 0;
            }
        } else {
            // pay remaining equity back to user
            let remaining_u128 = liquidatee_user_collateral.collateral_amount as u128;
            let payout_u64 = u64::try_from(remaining_u128).map_err(|_| PerpError::MathOverflow)?;

            if payout_u64 > 0 {
                token::transfer(
                    CpiContext::new_with_signer(
                        self.token_program.to_account_info(),
                        Transfer {
                            from: vault_quote.to_account_info(),
                            to: liquidatee_token_account.to_account_info(),
                            authority: global_config.to_account_info(),
                        },
                        &[signer_seeds],
                    ),
                    payout_u64,
                )?;
            }
         liquidatee_user_collateral.collateral_amount = 0;
        }
        Ok(())
    }
}
