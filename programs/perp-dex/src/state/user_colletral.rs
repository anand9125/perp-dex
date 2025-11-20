use anchor_lang::prelude:: *;

#[account]
#[derive(InitSpace)]
pub struct UserCollateral {
    pub owner: Pubkey,
    pub collateral_amount: i128,     /// stored in quote token smallest units (u64 token amounts converted to i128 for signed math)
    pub last_updated: i64,
}