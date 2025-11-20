use anchor_lang::prelude::*;

use anchor_spl::{
    associated_token::AssociatedToken,
    token::{ self, Mint, Token, TokenAccount, Transfer},
};

use crate::{PerpError, UserCollateral};

#[derive(Accounts)]

pub struct DepositColletral <'info>{
    #[account(mut)]
    pub user: Signer<'info>,

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
    )]
    pub vault_quote: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = user,
        space = UserCollateral::INIT_SPACE,
        seeds = [b"user_colletral", user.key().as_ref()],
        bump
    )]
    pub user_colletral : Account<'info,UserCollateral>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,

}
impl <'info> DepositColletral <'info>{
    pub fn process(
        &mut self,
        amount:u64
    )->Result<()>{
        require!(amount>0,crate::PerpError::InvalidAmount);

        // Transfer USDC from user to vault
        token::transfer(
            CpiContext::new(
                self.token_program.to_account_info(),
                Transfer{
                    from:self.user_wallet_account.to_account_info(),
                    to:self.vault_quote.to_account_info(),
                    authority:self.user.to_account_info(),
                }
            ),
            amount
        )?;
        // Update user collateral account
        let user_colletral = &mut self.user_colletral;
        user_colletral.owner = self.user.key();
        let amount_i128 = i128::try_from(amount).map_err(|_|PerpError::MathOverflow)?;
        user_colletral.collateral_amount = user_colletral.collateral_amount
            .checked_add(amount_i128)
            .ok_or(PerpError::MathOverflow)?;
        user_colletral.last_updated = Clock::get()?.unix_timestamp;

        emit!(DepositEvent{
            user: self.user.key(),
            amount,
            new_collateral_amount: user_colletral.collateral_amount,
            timestamp : user_colletral.last_updated,
        });


        Ok(())
    }
    
}

#[event]
pub struct DepositEvent{
    pub user: Pubkey,
    pub amount: u64,
    pub new_collateral_amount: i128,
    pub timestamp: i64,
}