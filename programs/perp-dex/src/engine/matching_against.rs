use anchor_lang::{prelude::*};

use crate::{ MatchedOrder, Order, OrderType, Side, Slab};

pub fn match_against_book<'info>(
    book: &mut Slab,
    order: &Order,
    ctx: &mut crate::instructions::process_order::ProcessOrder<'info>
) -> Result<u64> {

    let mut remaining_qty = order.qty;

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
        ctx.event_queue.push(MatchedOrder {
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
        })?;

        //taker eveent
        ctx.event_queue.push(MatchedOrder {
            is_maker:false,
            order_id:order.order_id,
            user:order.user,
            fill_price:fill_price,
            fill_qty:fill_qty,
            side:order.side,
            timestamp:Clock::get()?.unix_timestamp
        });

        // decrease remaining
        remaining_qty -= fill_qty;

        if fill_qty == available_qty {
            book.remove_leaf(idx)?;
        } else {
            let leaf = book.nodes[idx as usize].as_leaf_mut();
            leaf.quantity -= fill_qty;
        }
    }
    Ok(remaining_qty)
}
