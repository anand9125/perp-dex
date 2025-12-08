use anchor_lang::prelude::*;
use crate::{EventQueue, INNER_NODE, LEAF_NODE, MatchedOrder, MatchingType, Order, OrderType, PerpError, Side, Slab};

pub fn match_against_book<'info>(
    book: &mut Slab,
    order: &Order,
    event_queue: &mut AccountLoader<'info, EventQueue>,
    match_type: MatchingType,
) -> Result<(u64, Vec<MatchedOrder>)> {
    let event_queue = &mut event_queue.load_mut()?;

    msg!(
        "MATCH: START side={:?} qty={} order_id={} limit_price={}",
        order.side,
        order.qty,
        order.order_id,
        order.limit_price
    );
    msg!(
        "MATCH: Initial slab header => leaf_count={} root={} free_head={} bump_index={}",
        book.header.leaf_count,
        book.header.root,
        book.header.free_list_head,
        book.header.bump_index
    );

    let mut remaining_qty = order.qty;
    let mut taker_fills: Vec<MatchedOrder> = Vec::new();

    while remaining_qty > 0 {
        msg!(
            "MATCH LOOP: remaining_qty={} side={:?}",
            remaining_qty,
            order.side
        );

        let best_index_opt = match order.side {
            Side::Buy => book.find_min(),
            Side::Sell => book.find_max(),
        };

        let Some(idx) = best_index_opt else {
            msg!("MATCH LOOP: No best index found (book empty), breaking");
            break;
        };

        let node_tag = book.nodes[idx as usize].tag();
        msg!(
            "MATCH LOOP: best_idx={} tag={} (LEAF_NODE={} INNER_NODE={})",
            idx,
            node_tag,
            LEAF_NODE,
            INNER_NODE
        );

        if node_tag != LEAF_NODE {
            msg!(
                "MATCH ERROR: best_idx={} is not a LEAF (tag={}), returning InvalidTree",
                idx,
                node_tag
            );
            return Err(PerpError::InvalidTree.into());
        }

        let best_leaf = book.nodes[idx as usize].as_leaf();
        let best_price = best_leaf.price();
        let available_qty = best_leaf.quantity;

        msg!(
            "MATCH LOOP: best_leaf idx={} price={} avail_qty={} key={}",
            idx,
            best_price,
            available_qty,
            best_leaf.key
        );

        let price_ok = match order.order_type {
            OrderType::Market => {
                msg!("MATCH LOOP: Market order => price always ok");
                true
            }
            OrderType::Limit => match order.side {
                Side::Buy => {
                    let ok = order.limit_price >= best_price;
                    msg!(
                        "MATCH LOOP: Limit BUY price check => limit={} best={} ok={}",
                        order.limit_price,
                        best_price,
                        ok
                    );
                    ok
                }
                Side::Sell => {
                    let ok = order.limit_price <= best_price;
                    msg!(
                        "MATCH LOOP: Limit SELL price check => limit={} best={} ok={}",
                        order.limit_price,
                        best_price,
                        ok
                    );
                    ok
                }
            },
        };

        if !price_ok {
            msg!("MATCH LOOP: Price check failed, breaking");
            break;
        }

        let fill_qty = remaining_qty.min(available_qty);
        let fill_price = best_price;
        let now = Clock::get()?.unix_timestamp;

        msg!(
            "MATCH FILL: idx={} fill_qty={} fill_price={} avail_before={}",
            idx,
            fill_qty,
            fill_price,
            available_qty
        );

        // Maker event (book side)
        let maker_event = MatchedOrder {
            is_maker: true,
            order_id: best_leaf.key,
            user: best_leaf.owner,
            fill_price,
            fill_qty,
            side: match order.side {
                Side::Buy => Side::Sell,
                Side::Sell => Side::Buy,
            },
            timestamp: now,
        };

        // // Taker event (incoming order)
        let taker_event = MatchedOrder {
            is_maker: false,
            order_id: order.order_id,
            user: order.user,
            fill_price,
            fill_qty,
            side: order.side,
            timestamp: now,
        };

        match match_type {
            MatchingType::Normal => {
                msg!("MATCH EVENTS: Pushing taker + maker to event_queue");
                event_queue.push(&taker_event)?;
                event_queue.push(&maker_event)?;
            }
            MatchingType::Liquidation => {
                msg!("MATCH EVENTS: Liquidation match => push maker only, store taker fill");
                event_queue.push(&maker_event)?;
                taker_fills.push(taker_event);
            }
        }

        // update remaining taker qty
        remaining_qty -= fill_qty;
        msg!(
            "MATCH LOOP: after fill => remaining_qty={}, available_qty_before={}",
            remaining_qty,
            available_qty
        );

        if fill_qty == available_qty {
            msg!("MATCH LOOP: full consume => removing leaf idx={}", idx);
            book.remove_leaf(idx)?;
        } else {
            msg!(
                "MATCH LOOP: partial consume => updating leaf idx={} new_qty={}",
                idx,
                available_qty - fill_qty
            );
            let leaf_mut = book.nodes[idx as usize].as_leaf_mut();
            leaf_mut.quantity -= fill_qty;
        }

        msg!(
            "MATCH LOOP: post-update header => leaf_count={} root={}",
            book.header.leaf_count,
            book.header.root
        );
    }

    msg!(
        "MATCH: END remaining_qty={} taker_fills={}",
        remaining_qty,
        taker_fills.len()
    );

    Ok((remaining_qty, taker_fills))
}
