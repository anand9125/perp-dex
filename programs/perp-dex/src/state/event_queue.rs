use anchor_lang::prelude::*;
use crate::{
    MAX_REQUESTS,
    MatchedOrder,
    PerpError,
    slot::{EVENT_SLOT_LEN, EventSlot},
};

#[account(zero_copy)]
#[repr(C)]
pub struct EventQueue {
    pub head: u16,
    pub tail: u16,
    pub count: u16,
    pub capacity: u16,
    pub sequence: u64,
    pub slots: [EventSlot; MAX_REQUESTS],
}

impl EventQueue {
    pub const SIZE: usize = core::mem::size_of::<EventQueue>();
}

impl EventQueue {
    pub fn init(&mut self) {
        self.head = 0;
        self.tail = 0;
        self.count = 0;
        self.capacity = MAX_REQUESTS as u16;
        self.sequence = 0;

        for slot in self.slots.iter_mut() {
            slot.is_occupied = 0;
            slot.len = 0;
            slot._pad = [0; 5];
            slot.data = [0; EVENT_SLOT_LEN];
        }
    }
    fn encode_into_slot(slot: &mut EventSlot, ev: &MatchedOrder) -> Result<()> {
        let encoded = ev
            .try_to_vec()
            .map_err(|_| error!(PerpError::SerializationFailed))?;

        require!(encoded.len() <= EVENT_SLOT_LEN, PerpError::SerializationFailed);

        slot.data[..encoded.len()].copy_from_slice(&encoded);
        if encoded.len() < EVENT_SLOT_LEN {
            slot.data[encoded.len()..].fill(0);
        }

        slot.is_occupied = 0;
        slot.len = encoded.len() as u16;
        Ok(())
    }

    fn decode_from_slot(slot: &EventSlot) -> Result<MatchedOrder> {
        require!(slot.is_occupied == 1, PerpError::QueueEmpty);

        let len = slot.len as usize;
        require!(len > 0 && len <= EVENT_SLOT_LEN, PerpError::DeserializationFailed);

        MatchedOrder::try_from_slice(&slot.data[..len])
            .map_err(|_| error!(PerpError::DeserializationFailed))
    }


    pub fn push(&mut self, ev: &MatchedOrder) -> Result<()> {
        require!(
            (self.count as usize) < MAX_REQUESTS,
            PerpError::QueueFull
        );

        let idx = self.tail as usize;
        let slot = &mut self.slots[idx];

        Self::encode_into_slot(slot, ev)?;

        self.tail = (self.tail + 1) % self.capacity;
        self.count += 1;
        self.sequence += 1;

        Ok(())
    }

    pub fn pop(&mut self) -> Result<MatchedOrder> {
        require!(self.count > 0, PerpError::QueueEmpty);

        let idx = self.head as usize;
        let slot = &mut self.slots[idx];

        let ev = Self::decode_from_slot(slot)?;

        slot.is_occupied = 0;
        slot.len = 0;

        self.head = (self.head + 1) % self.capacity;
        self.count -= 1;

        Ok(ev)
    }
}
