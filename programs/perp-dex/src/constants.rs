use anchor_lang::prelude::*;

#[constant]
pub const SEED: &str = "anchor";

pub const SLAB_HEADER_LEN: usize = 32; // Fixed header size
pub const NODE_SIZE: usize = 88; // 88 bytes per node (8 + 80)

// Node type tags
pub const UNINITIALIZED: u32 = 0;
pub const INNER_NODE: u32 = 1;
pub const LEAF_NODE: u32 = 2;
pub const FREE_NODE: u32 = 3;
pub const LAST_FREE_NODE: u32 = 4;

pub const INVALID_INDEX: u32 = u32::MAX;


pub const BID_SLAB_CAPACITY: usize = 1000;
pub const ASK_SLAB_CAPACITY: usize = 1000;