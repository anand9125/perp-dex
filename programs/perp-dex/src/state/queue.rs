use anchor_lang::{Event, prelude::*};

#[account]
#[derive(InitSpace)]
 pub struct Queue {
    pub head:u64,
    pub tail:u64,
    pub count : u64,
    // pub event : [Event;128]

}

