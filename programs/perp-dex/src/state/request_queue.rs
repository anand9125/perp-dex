use anchor_lang::prelude::*;
use crate::{CancelOrder, MAX_REQUESTS, Order };
use crate::PerpError;
#[account]
#[derive(InitSpace)]
pub struct RequestQueue {
    pub head: u16,
    pub tail: u16,
    pub count: u16,
    pub capacity: u16,
    pub requests: [RequestType; MAX_REQUESTS],
    pub sequence: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone,InitSpace)]
pub enum RequestType {
    Place(Order),
    Cancel(CancelOrder),
}
impl RequestQueue {

    pub fn tail_idx(&self) -> usize {
        (self.tail % self.capacity) as usize
    }

    pub fn head_idx(&self) -> usize {
        (self.head % self.capacity) as usize
    }

    pub fn push(&mut self, request: RequestType) -> Result<()> {
        require!(self.count < self.capacity, PerpError::QueueFull);

        let idx = self.tail_idx();
        self.requests[idx] = request;

        self.tail = self.tail.wrapping_add(1);
        self.count = self.count.wrapping_add(1);

        Ok(())
    }

    pub fn pop(&mut self) -> Result<RequestType> {
        require!(self.count > 0, PerpError::QueueEmpty);

        let idx = self.head_idx();
        let req = self.requests[idx].clone();

        self.head = self.head.wrapping_add(1);
        self.count = self.count.wrapping_sub(1);

        Ok(req)
    }
}
