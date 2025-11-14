use anchor_lang::prelude::Pubkey;

#[derive(Debug, Clone)]
pub struct FillEvent {
    pub maker_order_id: u128,
    pub maker_owner: Pubkey,
    pub maker_client_order_id: u128,
    pub price: u64,
    pub quantity: u64,
}