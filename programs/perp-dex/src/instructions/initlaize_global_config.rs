use anchor_lang::prelude::*;
use anchor_spl::{
    token::{Mint, Token, TokenAccount},
    associated_token::AssociatedToken,
};
pub const MAX_REQUESTS:usize = 2;

use crate::{ GlobalConfig, PerpError, RequestQueue};

#[derive(Accounts)]
pub struct InitializeGlobalConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        seeds = [b"global_config"],
        bump,
        space = 8 + GlobalConfig::INIT_SPACE,
    )]

    pub global_config: Box<Account<'info, GlobalConfig>>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        seeds = [b"vault_quote", global_config.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = global_config,
    )]
    pub vault_quote: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = authority,
        seeds = [b"insurance_fund", global_config.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = global_config,
    )]
    pub insurance_fund: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = authority,
        associated_token::mint = usdc_mint,
        associated_token::authority = authority
    )]
    pub fee_pool: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = authority,
        space = RequestQueue::SIZE,
        seeds = [b"request_queue"],
        bump
    )]
    pub request_queues: Account<'info,RequestQueue>,
    //  #[account(
    //     init_if_needed,
    //     payer = authority,
    //     space = EventQueue::SIZE,
    //     seeds = [b"event_queue"],
    //     bump
    // )]
    // pub event_queues: Account<'info,EventQueue>,

  

    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
}


impl<'info> InitializeGlobalConfig<'info> {
    pub fn process(
        &mut self,
        is_paused: bool,
        funding_interval_secs: u32,
        bump: &InitializeGlobalConfigBumps,
    ) -> Result<()> {

        let global_config = &mut self.global_config;
        require!(
            global_config.authority == Pubkey::default()
                || global_config.authority == self.authority.key(),
            PerpError::NotAuthorized
        );
    
        global_config.authority = self.authority.key();
        global_config.vault_quote = self.vault_quote.key();
        global_config.insurance_fund = self.insurance_fund.key();
        global_config.fee_pool = self.fee_pool.key();
  //      global_config.request_queue = self.request_queues.key();
    //    global_config.event_queue = self.event_queues.key();
        global_config.trading_paused = is_paused;
        global_config.funding_interval_secs = funding_interval_secs;
        global_config.bump = bump.global_config;


        // let request_queues =  &mut self.request_queues;
        // request_queues.head = 0;
        // request_queues.tail = 0;
        // request_queues.sequence = 0;
        // request_queues.capacity = MAX_REQUESTS as u16;

        // let event_queuse = &mut self.event_queues;
        // event_queuse.head = 0;
        // event_queuse.tail = 0;
        // event_queuse.sequence = 0;
        // event_queuse.capacity = MAX_REQUESTS as u16;
   

        msg!("DBG: Exiting InitializeGlobalConfig::process");

        Ok(())
    }
}
