use anchor_lang::prelude::*;
use bytemuck::{Pod, Zeroable};

pub const REQUEST_SLOT_LEN: usize = 128;     // > 108, padded
pub const EVENT_SLOT_LEN: usize = 128; // Must fit largest serialized MatchedOrder
#[zero_copy]
#[repr(C)]
pub struct RequestSlot {
    pub is_occupied: u8,
    pub _pad: [u8; 7],
    pub data: [u8; REQUEST_SLOT_LEN],
}


#[zero_copy]
#[repr(C)]
pub struct EventSlot {
    pub is_occupied: u8,
    pub _pad: [u8; 7],
    pub data: [u8; EVENT_SLOT_LEN],
}