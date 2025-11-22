use anchor_lang::prelude::*;
use crate::slot::{REQUEST_SLOT_LEN, RequestSlot};
use crate::{CancelOrder, MAX_REQUESTS, Order };
use crate::PerpError;

#[account(zero_copy)]
#[repr(C)]
pub struct RequestQueue {
    pub head: u16,
    pub tail: u16,
    pub count: u16,
    pub capacity: u16,
    pub sequence: u64,
    pub slots: [RequestSlot; MAX_REQUESTS],
}

impl RequestQueue {
    pub const SIZE: usize = core::mem::size_of::<RequestQueue>();
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub enum RequestType {
    Place(Order),
    Cancel(CancelOrder),
}

impl RequestType {
    pub const SIZE: usize = 1 + 107; // 108 total
}

impl RequestQueue {
    /// Initialize empty queue
    pub fn init(&mut self) {
        self.head = 0;
        self.tail = 0;
        self.count = 0;
        self.capacity = MAX_REQUESTS as u16;
        self.sequence = 0;

        for slot in self.slots.iter_mut() {
            slot.is_occupied = 0;
            slot._pad = [0; 7];
            slot.data = [0; REQUEST_SLOT_LEN];
        }
    }

    fn encode_into_slot(slot: &mut RequestSlot, req: &RequestType) -> Result<()> {
        let encoded = req
            .try_to_vec()
            .map_err(|_| error!(PerpError::SerializationFailed))?;

        require!(
            encoded.len() <= REQUEST_SLOT_LEN,
            PerpError::SerializationFailed
        );

        slot.data[..encoded.len()].copy_from_slice(&encoded);
        if encoded.len() < REQUEST_SLOT_LEN {
            slot.data[encoded.len()..].fill(0);
        }
        slot.is_occupied = 1;

        Ok(())
    }

    fn decode_from_slot(slot: &RequestSlot) -> Result<RequestType> {
        require!(slot.is_occupied == 1, PerpError::QueueEmpty);

        // Find last non-zero (optional; or attempt full buffer)
        // For simplicity just try full buffer:
        RequestType::try_from_slice(&slot.data)
            .map_err(|_| error!(PerpError::DeserializationFailed))
    }

    pub fn push(&mut self, req: &RequestType) -> Result<()> {
        require!(
            (self.count as usize) < MAX_REQUESTS,
            PerpError::QueueFull
        );

        let idx = self.tail as usize;
        let slot = &mut self.slots[idx];

        Self::encode_into_slot(slot, req)?;

        self.tail = (self.tail + 1) % self.capacity;
        self.count += 1;
        self.sequence += 1;

        Ok(())
    }

    pub fn pop(&mut self) -> Result<RequestType> {
        require!(self.count > 0, PerpError::QueueEmpty);

        let idx = self.head as usize;
        let slot = &mut self.slots[idx];

        let req = Self::decode_from_slot(slot)?;

        // mark empty
        slot.is_occupied = 0;

        self.head = (self.head + 1) % self.capacity;
        self.count -= 1;

        Ok(req)
    }
}