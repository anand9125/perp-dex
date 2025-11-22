use anchor_lang::{prelude::*};

use crate::{ MatchedOrder, MatchingType, Order, OrderType, Side, Slab, event_queue};

pub fn match_against_book<'info>(
    book: &mut Slab,
    order: &Order,
    evnet_queue: &mut AccountLoader<'info, event_queue::EventQueue>,
    match_type:MatchingType,
) -> Result<(u64,Vec<MatchedOrder>)> {
    let evnet_queue = &mut evnet_queue.load_mut()?;

    let mut remaining_qty = order.qty;
    let mut taker_fills : Vec<MatchedOrder> =Vec::new();

    while remaining_qty > 0 {
        let best_index = match order.side {
            Side::Buy => book.find_min(),
            Side::Sell => book.find_max(),
        };

        let Some(idx) = best_index else {
            break;  
        };

        let best_leaf = book.nodes[idx as usize].as_leaf();
        let best_price = best_leaf.price();
        let available_qty = best_leaf.quantity;

        let price_ok = match order.order_type {
            OrderType::Market => true,
            OrderType::Limit => {
                match order.side {
                    Side::Buy => order.limit_price >= best_price,
                    Side::Sell => order.limit_price <= best_price,
                }
            }
        };
        if !price_ok {
            break;
        }
        let fill_qty = remaining_qty.min(available_qty);
        let fill_price = best_price;

        // Maker event
        let maker_event = MatchedOrder {
            is_maker:true,
            order_id:best_leaf.key,
            user:best_leaf.owner,
            fill_price : fill_price,
            fill_qty:fill_qty,
            side : match order.side {
                Side::Buy=>Side::Sell,
                Side::Sell=>Side::Buy
            },
            timestamp:Clock::get()?.unix_timestamp,
        };

        //taker eveent
        let taker_event = MatchedOrder {
            is_maker:false,
            order_id:order.order_id,
            user:order.user,
            fill_price:fill_price,
            fill_qty:fill_qty,
            side:order.side.clone(),
            timestamp:Clock::get()?.unix_timestamp
        };
        match match_type {
            MatchingType::Normal=>{
                evnet_queue.push(&taker_event)?;
                evnet_queue.push(&maker_event)?;
            }
            MatchingType::Liquidation=>{
                evnet_queue.push(&maker_event)?;
                taker_fills.push(taker_event);
            }
        };

        // decrease remaining
        remaining_qty -= fill_qty;

        if fill_qty == available_qty {
            book.remove_leaf(idx)?;
        } else {
            let leaf = book.nodes[idx as usize].as_leaf_mut();
            leaf.quantity -= fill_qty;
        }
    }
    Ok((remaining_qty,taker_fills))
}
