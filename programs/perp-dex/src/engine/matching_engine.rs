use anchor_lang::prelude::*;

use crate::{
    CancelOrder,
    LeafNode,
    MatchingType,
    Order,
    OrderType,
    PerpError,
    Side,
    Slab,
    match_against_book,
    DISCRIMINATOR_LEN,
};

pub struct MatchingEngine;

impl MatchingEngine {
    /// Match an order against the book and optionally place remainder as a limit order.
    pub fn process_place_order<'info>(
        ctx: &mut crate::instructions::process_order::ProcessOrder<'info>,
        order: Order,
    ) -> Result<()> {
        let fee: u8 = 2;
        let current_time = Clock::get()?.unix_timestamp;

        let remaining_qty = match order.side {
            Side::Buy => {
                let ask_account_info = ctx.asks.to_account_info();
                let mut ask_data = ask_account_info.try_borrow_mut_data()?;
                let ask_bytes: &mut [u8] = &mut ask_data[DISCRIMINATOR_LEN..];
                let ask_slab = Slab::from_bytes_mut(ask_bytes)?;
                log_match_header("BUY match asks", ask_slab);
                let (remaining, _) = match_against_book(
                    ask_slab,
                    &order,
                    &mut ctx.event_queue,
                    MatchingType::Normal,
                )?;
                remaining
            }
            Side::Sell => {
                let bid_account_info = ctx.bids.to_account_info();
                let mut bid_data = bid_account_info.try_borrow_mut_data()?;
                let bid_bytes: &mut [u8] = &mut bid_data[DISCRIMINATOR_LEN..];
                let bid_slab = Slab::from_bytes_mut(bid_bytes)?;
                log_match_header("SELL match bids", bid_slab);
                let (remaining, _) = match_against_book(
                    bid_slab,
                    &order,
                    &mut ctx.event_queue,
                    MatchingType::Normal,
                )?;
                remaining
            }
        };

        if remaining_qty > 0 {
            match order.order_type {
                OrderType::Limit => {
                    match order.side {
                        Side::Buy => {
                            let bid_account_info = ctx.bids.to_account_info();
                            let mut bid_data = bid_account_info.try_borrow_mut_data()?;
                            let bid_bytes: &mut [u8] = &mut bid_data[DISCRIMINATOR_LEN..];
                            let bid_slab = Slab::from_bytes_mut(bid_bytes)?;
                            log_match_header("insert bids limit", bid_slab);
                            let leaf = LeafNode::new(
                                order.order_id,
                                order.user,
                                remaining_qty,
                                fee,
                                current_time,
                            );
                            let order_index = bid_slab.insert_leaf(&leaf)?;
                            msg!(
                                "ME: Added limit BUY to bids at index={}, qty={}",
                                order_index,
                                remaining_qty
                            );
                        }
                        Side::Sell => {
                            let ask_account_info = ctx.asks.to_account_info();
                            let mut ask_data = ask_account_info.try_borrow_mut_data()?;
                            let ask_bytes: &mut [u8] = &mut ask_data[DISCRIMINATOR_LEN..];
                            let ask_slab = Slab::from_bytes_mut(ask_bytes)?;
                            log_match_header("insert asks limit", ask_slab);
                            let leaf = LeafNode::new(
                                order.order_id,
                                order.user,
                                remaining_qty,
                                fee,
                                current_time,
                            );
                            let order_index = ask_slab.insert_leaf(&leaf)?;
                            msg!(
                                "ME: Added limit SELL to asks at index={}, qty={}",
                                order_index,
                                remaining_qty
                            );
                        }
                    }
                }
                OrderType::Market => {
                    msg!(
                        "ME: Market {:?} partially filled, remaining {} cancelled",
                        order.side,
                        remaining_qty
                    );
                }
            }
        }

        Ok(())
    }

    pub fn process_cancel_order<'info>(
        ctx: &mut crate::instructions::process_order::ProcessOrder<'info>,
        cancel_order: CancelOrder,
    ) -> Result<()> {
        let removed_leaf = match cancel_order.side {
            Side::Buy => {
                let bid_account_info = ctx.bids.to_account_info();
                let mut bid_data = bid_account_info.try_borrow_mut_data()?;
                let bid_bytes: &mut [u8] = &mut bid_data[DISCRIMINATOR_LEN..];
                let bid_slab = Slab::from_bytes_mut(bid_bytes)?;
                let order_index = bid_slab
                    .find_by_key(cancel_order.order_id)
                    .ok_or(PerpError::OrderNotFound)?;
                msg!("ME: Cancel BUY, removing order at index={}", order_index);
                bid_slab.remove_leaf(order_index)?
            }
            Side::Sell => {
                let ask_account_info = ctx.asks.to_account_info();
                let mut ask_data = ask_account_info.try_borrow_mut_data()?;
                let ask_bytes: &mut [u8] = &mut ask_data[DISCRIMINATOR_LEN..];
                let ask_slab = Slab::from_bytes_mut(ask_bytes)?;
                let order_index = ask_slab
                    .find_by_key(cancel_order.order_id)
                    .ok_or(PerpError::OrderNotFound)?;
                msg!("ME: Cancel SELL, removing order at index={}", order_index);
                ask_slab.remove_leaf(order_index)?
            }
        };

        msg!(
            "ME: Cancelled order key={}, qty={}, price={}",
            removed_leaf.key,
            removed_leaf.quantity,
            removed_leaf.price()
        );

        Ok(())
    }
}

fn log_match_header(label: &str, slab: &Slab) {
    msg!(
        "ME: {} => leaf_count={} bump_index={} free_head={} root={}",
        label,
        slab.header.leaf_count,
        slab.header.bump_index,
        slab.header.free_list_head,
        slab.header.root
    );
}
