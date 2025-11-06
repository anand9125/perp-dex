use anchor_lang::prelude::*;
use anchor_spl::{
    token::{Mint, Token, TokenAccount},
    associated_token::AssociatedToken,
};

use crate::{GlobalConfig, PerpError};

#[derive(Accounts)]
pub struct InitializeGlobalConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init_if_needed,
        payer = authority,
        seeds = [b"global_config"],
        bump,
        space = 8 + GlobalConfig::INIT_SPACE,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = usdc_mint,
        associated_token::authority = global_config
    )]
    pub vault_quote: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = usdc_mint,
        associated_token::authority = global_config
    )]
    pub insurance_fund: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = usdc_mint,
        associated_token::authority = authority
    )]
    pub fee_pool: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
}

impl<'info> InitializeGlobalConfig<'info> {
    pub fn process(
        &mut self,
        is_paused: bool,
        im_bps: u16,
        mm_bps: u16,
        taker_fee_bps: u16,
        maker_rebate_bps: u16,     
        liq_penalty_bps: u16,     
        oracle_band_bps: u16,     
        funding_interval_secs: u32 
    ) -> Result<()> {
        let global_config = &mut self.global_config;

        require!(
            global_config.authority == Pubkey::default() ||
            global_config.authority == self.authority.key(),
            PerpError::NotAuthorized
        );

        global_config.authority = self.authority.key();
        global_config.vault_quote = self.vault_quote.key();
        global_config.insurance_fund = self.insurance_fund.key();
        global_config.fee_pool = self.fee_pool.key();
        global_config.trading_paused = is_paused;

        global_config.im_bps_default = im_bps;
        global_config.mm_bps_default = mm_bps;
        global_config.taker_fee_bps = taker_fee_bps;
        global_config.maker_fee_bps = maker_rebate_bps;
        global_config.liq_penalty_bps= liq_penalty_bps;
        global_config.oracle_band_bps = oracle_band_bps;
        global_config.funding_interval_secs = funding_interval_secs;


        Ok(())
    }
}
