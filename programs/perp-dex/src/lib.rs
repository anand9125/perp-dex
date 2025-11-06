pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("6FFcqM61UALXUBeXPDQw1J8MLH9r9T5cTsV3uFxQdqLK");

#[program]
pub mod perp_dex {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        initialize::handler(ctx)
    }
    
}
