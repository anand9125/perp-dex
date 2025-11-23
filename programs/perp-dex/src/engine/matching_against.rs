use anchor_lang::{prelude::*};

use crate::{ EventQueue, MatchedOrder, MatchingType, Order, OrderType, Side, Slab};
use crate::{DISCRIMINATOR_LEN};


pub fn match_against_book<'info>(
    book: &mut Slab,
    order: &Order,
    event_queue: &mut AccountLoader<'info, EventQueue>,
    match_type: MatchingType,
) -> Result<(u64, Vec<MatchedOrder>)> {
    let event_queue = &mut event_queue.load_mut()?;

    let mut remaining_qty = order.qty;
    let mut taker_fills = Vec::new();

    while remaining_qty > 0 {
        let best_index = match order.side {
            Side::Buy => book.find_min(),
            Side::Sell => book.find_max(),
        };

        let Some(idx) = best_index else {
            break; // no liquidity
        };

        msg!("MATCH: best_idx={} tag={}", idx, book.nodes[idx as usize].tag());

        let best_leaf = book.nodes[idx as usize].as_leaf();
        let best_price = best_leaf.price();
        let available_qty = best_leaf.quantity;

        let price_ok = match order.order_type {
            OrderType::Market => true,
            OrderType::Limit => match order.side {
                Side::Buy => order.limit_price >= best_price,
                Side::Sell => order.limit_price <= best_price,
            },
        };

        if !price_ok {
            msg!("MATCH: Price condition failed");
            break;
        }

        let fill_qty = remaining_qty.min(available_qty);
        let fill_price = best_price;
        let timestamp = Clock::get()?.unix_timestamp;

        // Taker event
        let taker_event = MatchedOrder {
            is_maker: false,
            order_id: order.order_id,
            user: order.user,
            fill_price,
            fill_qty,
            side: order.side,
            timestamp,
        };

        // Maker event
        let maker_event = MatchedOrder {
            is_maker: true,
            order_id: best_leaf.key,
            user: best_leaf.owner,
            fill_price,
            fill_qty,
            side: if matches!(order.side, Side::Buy) {
                Side::Sell
            } else {
                Side::Buy
            },
            timestamp,
        };

        match match_type {
            MatchingType::Normal => {
                event_queue.push(&taker_event)?;
                event_queue.push(&maker_event)?;
            }
            MatchingType::Liquidation => {
                event_queue.push(&maker_event)?;
                taker_fills.push(taker_event);
            }
        };

        remaining_qty -= fill_qty;
        msg!("MATCH: filled {} remaining {}", fill_qty, remaining_qty);

        if fill_qty == available_qty {
            book.remove_leaf(idx)?;
        } else {
            let leaf = book.nodes[idx as usize].as_leaf_mut();
            leaf.quantity -= fill_qty;
        }
    }

    msg!("MATCH COMPLETE: remaining_qty={}", remaining_qty);
    Ok((remaining_qty, taker_fills))
}
