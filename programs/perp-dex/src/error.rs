use anchor_lang::prelude::*;

#[error_code]
pub enum PerpError {
    #[msg("Custom error message")]
    CustomError,
    #[msg(" user is unauhtorized")]
    NotAuthorized

}
