
use anchor_lang::prelude::*;

use anchor_spl::{
    associated_token::AssociatedToken, token::{self, Mint, Token, TokenAccount, Transfer}
};
use crate::{GlobalConfig, MarketState, PerpError, Position, Ratio, RiskEngine, UserCollateral};
#[derive(Accounts)]
pub struct  Withdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"user_colletral",user.key().as_ref()],
        bump
    )]
    pub user_colletral : Account<'info,UserCollateral>,
    #[account(
        mut,
        seeds = [b"global_config"],
        bump = global_config.bump
    )]
    pub global_config : Account<'info,GlobalConfig>,

    pub usdc_mint : Account<'info,Mint>,
    #[account(
        mut,
        constraint = vault_quote.mint == usdc_mint.key(),
        constraint = vault_quote.owner == global_config.key()
    )]
    pub vault_quote : Account<'info,TokenAccount>,

    #[account(
        mut,
        constraint = user_ata.mint == usdc_mint.key(),
        constraint = user_ata.owner == user.key()
    )]
    pub user_ata  : Account<'info,TokenAccount>,
    #[account(
        mut,
        seeds = [b"market", market.symbol.as_bytes()],
        bump
    )]
    pub market : Account<'info,MarketState>,


    #[account(
        mut,
        seeds = [b"position", market.symbol.as_bytes(), user.key().as_ref()],
        bump
    )]
    pub user_position_ : Account<'info,Position>,

    pub associated_token_program: Program<'info,AssociatedToken>,
    pub system_program : Program<'info,System>,
    pub token_program : Program<'info,Token>

}

impl <'info> Withdraw <'info> {
    pub fn process(
        &mut self,
        withdraw_amount:u64
    )->Result<()>{
        let user_colletral = &mut self.user_colletral;
        let vault_quote = &mut self.vault_quote;
        let user_position = &mut self.user_position_;
        let market = &self.market;
        let global_config = &self.global_config;

        let available = user_colletral.collateral_amount;
        let withdraw_i128 = withdraw_amount as i128;

        require!(withdraw_i128 > 0 ,PerpError::InvalidAmount);
        require!(available >= withdraw_i128,PerpError::InsufficientCollateral);
        
        //lets compute helth after withdrawls
        let new_colletral = available
            .checked_sub(withdraw_i128)
            .ok_or(PerpError::MathOverflow)?;

        let mark_price = market.get_mark_price()?;
        let maintain_ratio = Ratio::from_bps(market.mm_bps);


        let unreal = RiskEngine::unrealized_pnl(
            user_position.base_position as i128,
            user_position.entry_price as u128,
            mark_price
        )?;

        let mainatenance = RiskEngine::maintenance_margin(
            user_position.base_position as i128,
            mark_price,
            maintain_ratio
        )?;

        let health_after = new_colletral
            .checked_add(unreal)
            .and_then(|v|v.checked_sub(mainatenance as i128))
            .ok_or(PerpError::MathOverflow)?;

        require!(health_after>0 , PerpError::WithdrawWouldLiquidate);

        user_colletral.collateral_amount = new_colletral;

        let signer_seeds: &[&[u8]] = &[b"global_config", &[global_config.bump]];

        token::transfer(
             CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                Transfer{
                    from: vault_quote.to_account_info(),
                    to: self.user_ata.to_account_info(),
                    authority: self.global_config.to_account_info()
                },
                &[signer_seeds]
             ),
             withdraw_amount
        )?;
        Ok(())
    }
    
}