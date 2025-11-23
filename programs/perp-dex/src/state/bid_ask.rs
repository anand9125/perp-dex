use anchor_lang::prelude::*;

#[account(zero_copy)]
#[repr(C)]
pub struct BidAsk {  //You’re going to fill the BidAsk account’s bytes with the serialized bytes of a Slab.

}