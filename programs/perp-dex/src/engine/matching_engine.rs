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
    DISCRIMINATOR_LEN, // const usize = 8;
};

pub struct MatchingEngine;

impl MatchingEngine {
    pub fn process_place_order<'info>(
        ctx: &mut crate::instructions::process_order::ProcessOrder<'info>,
        order: Order,
    ) -> Result<()> {
        // TODO: taker/maker fee logic from global config
        let fee: u8 = 2;
        let current_time = Clock::get()?.unix_timestamp;

        match order.side {
            Side::Buy => {
                // ----- match against ASKS first -----
                let mut ask_account_info = ctx.asks.to_account_info();
                let mut ask_data = ask_account_info.try_borrow_mut_data()?;
                // skip 8-byte Anchor discriminator
                let ask_bytes: &mut [u8] = &mut ask_data[DISCRIMINATOR_LEN..];
                let ask_slab = Slab::from_bytes_mut(ask_bytes)?;

                msg!(
                    "ME: Before match BUY, asks header => leaf_count={} bump_index={} free_head={} root={}",
                    ask_slab.header.leaf_count,
                    ask_slab.header.bump_index,
                    ask_slab.header.free_list_head,
                    ask_slab.header.root
                );

                let (remaining_qty, _) = match_against_book(
                    ask_slab,
                    &order,
                    &mut ctx.event_queue,
                    MatchingType::Normal,
                )?;

                // If some quantity remains → place as bid limit order
                if remaining_qty > 0 {
                    match order.order_type {
                        OrderType::Limit => {
                            // Release ask_data borrow before touching bids
                            drop(ask_data);

                            let mut bid_account_info = ctx.bids.to_account_info();
                            let mut bid_data = bid_account_info.try_borrow_mut_data()?;
                            let bid_bytes: &mut [u8] = &mut bid_data[DISCRIMINATOR_LEN..];
                            let bid_slab = Slab::from_bytes_mut(bid_bytes)?;

                            msg!(
                                "ME: Before insert BUY, bids header => leaf_count={} bump_index={} free_head={} root={}",
                                bid_slab.header.leaf_count,
                                bid_slab.header.bump_index,
                                bid_slab.header.free_list_head,
                                bid_slab.header.root
                            );

                            let leaf = LeafNode::new(
                                order.order_id,
                                order.user,
                                remaining_qty,
                                fee,
                                current_time,
                            );
                            let order_index = bid_slab.insert_leaf(&leaf)?;
                            msg!(
                                "ME: Added limit BUY to bid book at index={}, qty={}",
                                order_index,
                                remaining_qty
                            );
                        }
                        OrderType::Market => {
                            msg!(
                                "ME: Market BUY partially filled, remaining {} will be cancelled",
                                remaining_qty
                            );
                        }
                    }
                }
            }

            Side::Sell => {
                // ----- match against BIDS first -----
                let mut bid_account_info = ctx.bids.to_account_info();
                let mut bid_data = bid_account_info.try_borrow_mut_data()?;
                let bid_bytes: &mut [u8] = &mut bid_data[DISCRIMINATOR_LEN..];
                let bid_slab = Slab::from_bytes_mut(bid_bytes)?;

                msg!(
                    "ME: Before match SELL, bids header => leaf_count={} bump_index={} free_head={} root={}",
                    bid_slab.header.leaf_count,
                    bid_slab.header.bump_index,
                    bid_slab.header.free_list_head,
                    bid_slab.header.root
                );

                let (remaining_qty, _) = match_against_book(
                    bid_slab,
                    &order,
                    &mut ctx.event_queue,
                    MatchingType::Normal,
                )?;

                if remaining_qty > 0 {
                    match order.order_type {
                        OrderType::Limit => {
                            // release bid_data before touching asks
                            drop(bid_data);

                            let mut ask_account_info = ctx.asks.to_account_info();
                            let mut ask_data = ask_account_info.try_borrow_mut_data()?;
                            let ask_bytes: &mut [u8] = &mut ask_data[DISCRIMINATOR_LEN..];
                            let ask_slab = Slab::from_bytes_mut(ask_bytes)?;

                            msg!(
                                "ME: Before insert SELL, asks header => leaf_count={} bump_index={} free_head={} root={}",
                                ask_slab.header.leaf_count,
                                ask_slab.header.bump_index,
                                ask_slab.header.free_list_head,
                                ask_slab.header.root
                            );

                            let leaf = LeafNode::new(
                                order.order_id,
                                order.user,
                                remaining_qty,
                                fee,
                                current_time,
                            );
                            let order_index = ask_slab.insert_leaf(&leaf)?;
                            msg!(
                                "ME: Added limit SELL to ask book at index={}, qty={}",
                                order_index,
                                remaining_qty
                            );
                        }
                        OrderType::Market => {
                            msg!(
                                "ME: Market SELL partially filled, remaining quantity={}",
                                remaining_qty
                            );
                        }
                    }
                }
            }
        }

        Ok(())
    }

    pub fn process_cancel_order<'info>(
        ctx: &mut crate::instructions::process_order::ProcessOrder<'info>,
        cancel_order: CancelOrder,
    ) -> Result<()> {
        // TODO: pre-checks (ownership, etc.)

        let removed_leaf = match cancel_order.side {
            Side::Buy => {
                let mut bid_account_info = ctx.bids.to_account_info();
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
                let mut ask_account_info = ctx.asks.to_account_info();
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
