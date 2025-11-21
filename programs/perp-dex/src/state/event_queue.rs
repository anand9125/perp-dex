use anchor_lang::prelude::*;

use crate::{MAX_REQUESTS, MatchedOrder,PerpError};

#[account]
 pub struct EventQueue {
    pub head: u16,       // index for crank to read
    pub tail: u16,       // index for users to write
    pub count: u16,      // current active requests
    pub capacity: u16,   // total slots
    pub events: [MatchedOrder;MAX_REQUESTS],  //requests is an array
    pub sequence : u64

}
impl EventQueue {
    pub const SIZE: usize =
        8 +                           // discriminator
        16 +                          // head, tail, count, capacity, sequence
        (MatchedOrder::SIZE * MAX_REQUESTS)
        + 512;                        // safety padding
}

impl EventQueue {
       pub fn tail_idx(&self) -> usize {
        (self.tail % self.capacity) as usize
    }

    pub fn head_idx(&self) -> usize {
        (self.head % self.capacity) as usize
    }
    pub fn push(&mut self, event: MatchedOrder) -> Result<()> {
        require!(self.count < self.capacity, PerpError::QueueFull);

        let idx = self.tail_idx();
        self.events[idx] = event;

        self.tail = self.tail.wrapping_add(1);
        self.count = self.count.wrapping_add(1);
        self.sequence += 1;

        Ok(())
    }
    pub fn pop(&mut self)->Result<MatchedOrder>{
        require!(self.count>0,PerpError::QueueEmpty);

        let idx = self.head_idx();
        let match_order = self.events[idx].clone();

        self.head = self.head.wrapping_add(1);
        self.count = self.count.wrapping_sub(1);
        Ok(match_order)
    }
    
}

