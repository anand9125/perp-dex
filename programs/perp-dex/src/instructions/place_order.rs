use anchor_lang::prelude::*;
use anchor_spl::{
    token::{Mint, Token, TokenAccount},
    associated_token::AssociatedToken,
};

use crate::{GlobalConfig, MarketState, Position};
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
        constraint = vault_quote.mint == usdc_mint.key(),
    )]
    pub vault_quote: Account<'info, TokenAccount>,
    // #[account(
    //     init_if_needed,
    //     space = Position::INIT_SPACE,
    //     payer = authority,
    //     seeds = [b"position",market.symbol.as_ref(),user_id.to_le_bytes().as_ref()],
    //     bump 
    // )]
    // pub position_per_market : Account<'info,Position>,


    pub system_program : Program<'info,System>,
    pub associated_token_program : Program<'info,AssociatedToken>,
    pub token_program : Program<'info,Token>

}