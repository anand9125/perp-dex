use anchor_lang::{prelude::*};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint,  Token, TokenAccount, Transfer},
};
use crate::{BidAsk, EventQueue, GlobalConfig, MarketState, MatchingType, Order, OrderType, PerpError, Position, Ratio, RiskEngine, Side, global, match_against_book};

#[derive(Accounts)]
pub struct Liquidation<'info>{
    #[account(mut)]
    pub liquidator: Signer<'info>,
    #[account(
        mut,
        constraint = liquidator_token_account.mint == usdc_mint.key(),
        constraint = liquidator_token_account.owner == liquidator.key()
    )]
    pub liquidator_token_account: Account<'info,TokenAccount>,

    #[account(
        mut,
        seeds = [b"market",market.symbol.as_bytes()],
        bump
    )]
    pub market : Account<'info,MarketState>,
    #[account(
        mut,
        seeds = [b"bids",market.symbol.as_bytes()],
        bump
    )]
    pub bids : Account<'info,BidAsk>,
    #[account(
        mut,
        seeds = [b"asks",market.symbol.as_bytes()],
        bump
    )]
    pub ask: Account<'info,BidAsk>,
    
    #[account(
        mut,
        seeds = [b"event_queue"],
        bump
    )]
    pub event_queue : Account<'info,EventQueue>,
    #[account(
        mut,
        seeds = [b"position",market.symbol.as_bytes(),liquidatee_position.owner.as_ref()],
        bump
    )]
    pub liquidatee_position: Account<'info,Position>,
    #[account(
        mut,
        constraint = liquidatee_token_account.mint == usdc_mint.key(),
        constraint = liquidatee_token_account.owner == liquidatee_position.owner
    )]
    pub liquidatee_token_account: Account<'info,TokenAccount>,
  
    #[account(
        mut,
        seeds = [b"global_config"],
        bump
    )]
    pub global_config: Account<'info,GlobalConfig>,

    pub usdc_mint: Account<'info, Mint>,
    #[account(
        mut,
        constraint = insurance_fund.mint == usdc_mint.key(),
        constraint = insurance_fund.owner == global_config.key()
    )]
    pub insurance_fund : Account<'info,TokenAccount>,

    #[account(
        mut,
        constraint = vault_quote.mint == usdc_mint.key(),
        constraint = vault_quote.owner == global_config.key()
    )]
    pub vault_quote: Account<'info,TokenAccount>,
    
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
   
}

impl<'info> Liquidation <'info>{
    pub fn process(
        &mut self
    )->Result<()>{
        //TODO do all checks
        let event_queue = &mut self.event_queue;
        let bids = &mut self.bids;
        let asks = &mut self.ask;
        let market = &mut self.market;
        let target_pos = &mut self.liquidatee_position;
        let global_config = &mut self.global_config;
        let vault_quote = &mut self.vault_quote;
        let insurance_fund = &mut self.insurance_fund;
        let liquidator_token_account = &mut self.liquidator_token_account;
        let liquidatee_token_account = &mut self.liquidatee_token_account;

        require!(target_pos.base_position != 0, PerpError::NothingToLiquidate);

        let mark_price = market.get_mark_price()?;

        let maintain_ration = Ratio::from_bps(market.mm_bps);

        let colletral_i128 = target_pos.initial_margin as i128;
        let realized_pnl_i128 = target_pos.realized_pnl as i128;

        let health = RiskEngine::account_health_single(
                colletral_i128,
                realized_pnl_i128,
                target_pos.base_position as i128,
                target_pos.entry_price as u128,
                mark_price,
                maintain_ration
            )?;

        require!(health <0, PerpError::NothingToLiquidate);

        //calculate liquidation details
        let position_qty_abs = target_pos.base_position.abs() as u64;
        let is_long = target_pos.base_position >0;

        let liquidation_side = if is_long{Side::Sell}else{Side::Buy};
       

        let taker_order = Order{
            order_id : target_pos.order_id,
            user : target_pos.owner.to_bytes(),
            side : liquidation_side,
            qty : position_qty_abs,
            order_type : OrderType::Market,
            limit_price : 0,
            initial_margin : 0,
            leverage : 0,
            market : market.key(),
        };

        let (_remaining_qty,fills) = match liquidation_side {
            Side::Buy=>{
                let ask_account_info = &mut asks.to_account_info();
                let mut ask_data = ask_account_info.try_borrow_mut_data()?;
                let ask_bytes :&mut[u8] =  &mut **ask_data;
                let ask_slab= &mut crate::Slab::from_bytes_mut(ask_bytes)?;

                match_against_book(
                    ask_slab,
                    &taker_order,
                    event_queue,
                    MatchingType::Liquidation,
                )?
            }
            Side::Sell=>{
                let bid_account_info = &mut bids.to_account_info();
                let mut bid_data = bid_account_info.try_borrow_mut_data()?;
                let bid_bytes :&mut[u8] =  &mut **bid_data;
                let bid_slab= &mut crate::Slab::from_bytes_mut(bid_bytes)?;

                match_against_book(
                    bid_slab,
                    &taker_order,
                    event_queue,
                    MatchingType::Liquidation,
                )?
            }  
        };
        let mut total_closed_notional:u128 = 0;
        let total_filled_qty:u64 = fills.iter().map(|f|f.fill_qty).sum();
        let mut exit_avg_price : u128 =0;


        if fills.len()!=0 {
            for fills in fills.iter(){
                let fill_notional = (fills.fill_price as u128)
                    .checked_mul(fills.fill_qty as u128)
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
            //TODO :force closed at mark price
            //then also calculate avg price for the realize pnl and selltement to the user

            let forced_notional = (mark_price as u128)
                .checked_mul(_remaining_qty as u128)
                .ok_or(PerpError::MathOverflow)?;
            total_closed_notional = total_closed_notional
                .checked_add(forced_notional as u128)
                .ok_or(PerpError::MathOverflow)?;
            exit_avg_price = total_closed_notional
                .checked_div((total_filled_qty + _remaining_qty) as u128)
                .ok_or(PerpError::MathOverflow)?;
        }

        //update user position
        let realized_pnl = RiskEngine::realized_pnl(
            target_pos.base_position as i128,
            target_pos.entry_price as u128,
            exit_avg_price)?;  //final price at which the liquidator closed the position,it includes forced closed and order book
        
        target_pos.realized_pnl = target_pos.realized_pnl 
            .checked_add(realized_pnl as i64)
            .ok_or(PerpError::MathOverflow)?;

        target_pos.base_position = 0;
        target_pos.entry_price = 0;

        //calculate the panalty and transfer funds
        let liquidation_penalty_bps = global_config.liq_penalty_bps;
        let liquidator_share_bps = global_config.liquidator_share_bps;
        let bps_denominator:u128 = 10000;
        
        let penalty_amount  = total_closed_notional
            .checked_mul(liquidation_penalty_bps as u128)
            .and_then(|v|v.checked_div(bps_denominator))
            .ok_or(PerpError::MathOverflow)?;

        let liquidator_reward = penalty_amount
            .checked_mul(liquidator_share_bps as u128)
            .and_then(|v|v.checked_div(bps_denominator))
            .ok_or(PerpError::MathOverflow)?;
       
        let insurence_fund_amount = penalty_amount
            .checked_sub(liquidator_reward)
            .ok_or(PerpError::MathOverflow)?;

        token::transfer(
        CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            Transfer { 
                from:vault_quote.to_account_info(),
                to: liquidator_token_account.to_account_info(),
                authority : global_config.to_account_info()
            },
            &[&[b"global_config",&[global_config.bump]]],
        ),liquidator_reward as u64
       )?;

        token::transfer(
        CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            Transfer { 
                from: vault_quote.to_account_info(),
                to:  insurance_fund.to_account_info(),
                authority : global_config.to_account_info()
            },
            &[&[b"global_config",&[global_config.bump]]]
        ),insurence_fund_amount as u64
       )?;

        let final_equity = colletral_i128
            .checked_add(realized_pnl_i128)
            .and_then(|v|v.checked_sub(penalty_amount as i128))
            .ok_or(PerpError::MathOverflow)?;

        if final_equity<0 {
            let bad_debt = final_equity.abs() as u128;
            //take from insurance fund
            token::transfer(
                CpiContext::new_with_signer(
                    self.token_program.to_account_info(),
                    Transfer {
                        from: insurance_fund.to_account_info(),
                        to: vault_quote.to_account_info(),
                        authority : global_config.to_account_info()
                    },
                    &[&[b"global_config",&[global_config.bump]]]
                ),bad_debt as u64,
            )?;    
        }else {
            token::transfer(
                CpiContext::new_with_signer(
                    self.token_program.to_account_info(),
                    Transfer {
                        from:vault_quote.to_account_info(),
                        to:liquidatee_token_account.to_account_info(),
                        authority: global_config.to_account_info()
                    },&[&[b"global_config",&[global_config.bump]]]
                ),final_equity as u64,
            )?;
        };
     Ok(())        
    }
    
}

