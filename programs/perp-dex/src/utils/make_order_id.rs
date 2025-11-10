use crate::{OrderType, Side};

pub fn make_order_id(order_type: OrderType, side: Side, price: u64, sequence: u64) -> u128 {
    match order_type {
        OrderType::Limit => {
            let price_key = match side {
                Side::Buy => u64::MAX - price, // reverse for bids
                Side::Sell => price,
            };
            ((price_key as u128) << 64) | (sequence as u128)
        }
        OrderType::Market => sequence as u128, // use sequence only for market orders
    }
}
