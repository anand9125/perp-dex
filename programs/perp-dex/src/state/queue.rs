use anchor_lang::{prelude::*};

use crate::{MAX_REQUESTS, MatchedOrder, Order};

#[account]
#[derive(InitSpace)]
 pub struct RequestQueue {
    pub head: u16,       // index for crank to read
    pub tail: u16,       // index for users to write
    pub count: u16,      // The number of active, unprocessed requests currently waiting in the queue.
    pub capacity: u16,   // The maximum number of requests the queue can hold
    pub requests: [Order; MAX_REQUESTS],  //The array of actual Order structs (the circular buffer).
    pub sequence : u64
}



#[account]
#[derive(InitSpace)]
 pub struct EventQueue {
    pub head: u16,       // index for crank to read
    pub tail: u16,       // index for users to write
    pub count: u16,      // current active requests
    pub capacity: u16,   // total slots
    pub requests: [MatchedOrder; MAX_REQUESTS],  //requests is an array
    pub sequence : u64

}



