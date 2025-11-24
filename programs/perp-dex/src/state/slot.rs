use anchor_lang::prelude::*;
use bytemuck::{Pod, Zeroable};

pub const REQUEST_SLOT_LEN: usize = 128;     // > 108, padded
pub const EVENT_SLOT_LEN: usize = 128; // Must fit largest serialized MatchedOrder
#[zero_copy]
#[repr(C)]
pub struct RequestSlot {
    pub data: [u8; REQUEST_SLOT_LEN], // 128 bytes (8-byte aligned)
    pub len: u16,                     // 2 bytes
    pub is_occupied: u8,              // 1 byte
    pub _pad: [u8; 5],                // 5 bytes to reach 136B (multiple of 8)
}



#[zero_copy]
#[repr(C)]
pub struct EventSlot {
    pub data: [u8; EVENT_SLOT_LEN], // FIRST (for alignment + match RequestSlot)
    pub len: u16,
    pub is_occupied: u8,
    pub _pad: [u8; 5], // Padding to 8-byte boundary
}
