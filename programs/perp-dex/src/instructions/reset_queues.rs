use anchor_lang::prelude::*;

use crate::RequestQueue;

#[derive(Accounts)]
pub struct ResetQueue<'info> {
    #[account(mut, seeds = [b"request_queue"], bump)]
    pub request_queue: AccountLoader<'info, RequestQueue>,
}

impl<'info> ResetQueue<'info> {
    pub fn process(&mut self) -> Result<()> {
        let mut rq = self.request_queue.load_mut()?;
        
        // Reset struct fields correctly
        rq.head = 0;
        rq.tail = 0;
        rq.count = 0;
        rq.capacity = crate::MAX_REQUESTS as u16;
        rq.sequence = 0;

        // Fully zero out the slot memory
        for slot in rq.slots.iter_mut() {
            slot.is_occupied = 0;
            slot.len = 0;
            slot._pad = [0; 5];
            slot.data = [0; crate::slot::REQUEST_SLOT_LEN];
        }

        Ok(())
    }
}
