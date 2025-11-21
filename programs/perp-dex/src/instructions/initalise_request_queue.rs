use anchor_lang::prelude::*;
use anchor_spl::{
    token::{Mint, Token, TokenAccount},
    associated_token::AssociatedToken,
};

use crate::{GlobalConfig, RequestQueue};
pub const MAX_REQUESTS: usize = 32;

#[derive(Accounts)]

pub struct InitaliseRequestQueues<'info>{
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"global_config"],
        bump
    )]
    pub global_config: Account<'info,GlobalConfig>,
    #[account(
        init_if_needed,
        payer = authority,
        space = RequestQueue::SIZE,
        seeds = [b"request_queue"],
        bump
    )]
    pub request_queues: Account<'info,RequestQueue>,
     #[account(
        init_if_needed,
        payer = authority,
        space = RequestQueue::SIZE,
        seeds = [b"event_queue"],
        bump
    )]
    pub event_queues: Account<'info,RequestQueue>,

    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,

}
impl  <'info>InitaliseRequestQueues<'info> {
    pub fn process(
        &self
    )->Result<()>{


        Ok(())
    }
    
}