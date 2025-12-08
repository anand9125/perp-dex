use anchor_lang::prelude::*;
use bytemuck::{Pod, Zeroable};

pub const REQUEST_SLOT_LEN: usize = 128;     
pub const EVENT_SLOT_LEN: usize = 128; 
#[zero_copy]
#[repr(C)]
pub struct RequestSlot {
    pub data: [u8; REQUEST_SLOT_LEN], 
    pub len: u16,                     
    pub is_occupied: u8,              
    pub _pad: [u8; 5],             
}



#[zero_copy]
#[repr(C)]
pub struct EventSlot {
    pub data: [u8; EVENT_SLOT_LEN], 
    pub len: u16,
    pub is_occupied: u8,
    pub _pad: [u8; 5], 
}
