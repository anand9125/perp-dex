use std::{ ops::{Add}};

use anchor_lang::{prelude::*,};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint,  Token, TokenAccount, Transfer},
};
use anchor_lang::solana_program::sysvar::clock::Clock;

pub const MAX_HISTOY: usize = 1024;

use crate::{GlobalConfig, MarketState, Order, OrderHistory, PerpError, Position, RequestQueue, RequestType, make_order_id, request_queue};
#[derive(Accounts)]
#[instruction(user_id:u8 )]
pub struct PlaceOrder<'info>{
    #[account(mut)]
    pub user : Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"global_config"],
        bump = global_config.bump
    )]
    pub global_config : Account<'info,GlobalConfig>,
    #[account(
        mut,
        seeds = [b"market"],
        bump = market.bump
    )]
    pub market : Account<'info,MarketState>,

    pub usdc_mint: Account<'info, Mint>,
    #[account(
        mut,
        constraint = user_wallet_account.mint == usdc_mint.key(),
        constraint = user_wallet_account.owner == user.key()
    )]
    pub user_wallet_account: Account<'info,TokenAccount>,

    #[account(
        mut,
        constraint = vault_quote.mint == usdc_mint.key(),
        constraint = vault_quote.owner == global_config.key()
    )]
    pub vault_quote: Account<'info, TokenAccount>,
   #[account(
        init_if_needed,
        space = Position::INIT_SPACE,
        payer = user,
        seeds = [b"position", market.symbol.as_bytes(), user_id.to_le_bytes().as_ref()],
        bump
    )]
    pub position_per_market: Account<'info, Position>,
    
    #[account(
        mut,
        seeds = [b"request_queue"],
        bump
    )]
    pub request_queue : Account<'info,RequestQueue>,

    #[account(
        init_if_needed,
        space = OrderHistory::INIT_SPACE,
        payer = user,
        seeds = [b"user_history",user.key().as_ref()],
        bump
    )]
    pub order_history : Account<'info,OrderHistory>,

    pub system_program : Program<'info,System>,
    pub associated_token_program : Program<'info,AssociatedToken>,
    pub token_program : Program<'info,Token>
}

impl <'info> PlaceOrder <'info>{
    pub fn process(
        &mut self,
        order :Order
    )->Result<()>{
    //checks user balncnace and mm blances and all checks 
    
    let request_queues = &mut self.request_queue;

    require!(request_queues.count<request_queues.capacity,PerpError::QueueFull);
    


    //trasnfer user wallet to vau
    token::transfer(
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer{
              from:self.user_wallet_account.to_account_info(),
              to: self.vault_quote.to_account_info(),
              authority : self.user.to_account_info()
            }
        ),order.initial_margin
    )?;


    let seq = request_queues.sequence;
    let order_id = make_order_id(order.order_type , order.side , order.limit_price ,seq);
    request_queues.sequence = seq.add(1);


    //initalise the posiotion 
    let position = &mut self.position_per_market;
    position.owner = self.user.key();
    position.market = order.market;
    position.order_id = order_id;
    position.side = order.side;
    position.qty = order.qty;
    position.order_type = order.order_type;
    position.status = crate::OrderStatus::Pending;
    position.initial_margin = order.initial_margin;
    position.leverage = order.leverage;
    position.created_at =  Clock::get()?.unix_timestamp;

    let order_history = &mut self.order_history;
    order_history.push_order(order.clone());
    
    request_queues.push(RequestType::Place(order))?;

       Ok(())
    }
    
}