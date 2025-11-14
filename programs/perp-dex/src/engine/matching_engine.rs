use anchor_lang::prelude::*;

use crate::{ CancelOrder, LeafNode, Order, OrderType, PerpError, Side, Slab, match_against_book};

pub struct MatchingEngine;

impl MatchingEngine {
    pub fn process_place_order<'info>(
    ctx : &mut crate::instructions::process_order::ProcessOrder<'info>,
    order:Order
   )->Result<()>{
    
        //TODO get taker/maker fees calculation from global config
        let fee:u8 = 2;
        let current_time =  Clock::get()?.unix_timestamp; 
        match order.side {
            Side::Buy=>{
                let ask_account_info = &mut ctx.asks.to_account_info();
                let mut ask_data = ask_account_info.try_borrow_mut_data()?;
                let ask_bytes: &mut[u8] = &mut **ask_data; 
                let ask_slab = Slab::from_bytes_mut(ask_bytes)?;
                let remaining_qty= match_against_book(
                    ask_slab,
                    &order,
                    ctx
                )?;
                //Qty remain mean its limit order put in order book
                if remaining_qty > 0{
                    match order.order_type{
                        OrderType::Limit=>{
                            drop(ask_data); //Release ask

                            let bid_account_info = &mut ctx.bids.to_account_info();
                            let mut bid_data = bid_account_info.try_borrow_mut_data()?;
                            let bid_data_ref : &mut [u8] = &mut **bid_data;
                            let bid_slab = Slab::from_bytes_mut(bid_data_ref)?;

                            let leaf = LeafNode::new(
        
                                order.order_id,
                                order.user,
                                remaining_qty,
                                fee,
                                current_time  
                            );
                            let order_index = bid_slab.insert_leaf(&leaf)?;
                            msg!("Added limit buy order to bid book at index : {},qty : {}",order_index,remaining_qty);
                        }
                        OrderType::Market=>{
                            msg!("market buy order partially filled Reamining will get cancelled")
                            // self.cancel_order(order)?;
                        }
                    }
                }
            }
            Side::Sell=>{
                let bid_account_info = &mut ctx.bids.to_account_info();
                let mut bid_data = bid_account_info.try_borrow_mut_data()?;
                let bid_bytes :&mut[u8] =  &mut **bid_data;
                let bid_slab= Slab::from_bytes_mut(bid_bytes)?;

                let remaining_qty = match_against_book(
                    bid_slab,
                    &order,
                    ctx
                )?;
                if remaining_qty > 0 {
                    match order.order_type {
                        OrderType::Limit=>{
                            drop(bid_data);
                            let ask_acount_info = ctx.asks.to_account_info();
                            let mut ask_data = ask_acount_info.try_borrow_mut_data()?;
                            let ask_data_ref: &mut[u8] = &mut **ask_data;
                            let ask_slab = Slab::from_bytes_mut(ask_data_ref)?;
                            
                            let leaf = LeafNode::new(
                                order.order_id,
                                order.user,
                                remaining_qty,
                                fee,
                                current_time
                            );
                            let order_index = ask_slab.insert_leaf(&leaf)?;
                            msg!("Addded limit sell order to ask book at index:{},qty:{}",order_index,remaining_qty);
                        }
                        OrderType::Market=>{
                            msg!("Market sell order partially filled remaining quantity:{}",remaining_qty);
                            // self.cancel_order(order)?;
                        }
                    }
                }
            }  
        }
    Ok(())
    }
    pub fn process_cancel_order<'info>(
        ctx : &mut crate::instructions::process_order::ProcessOrder<'info>,
        cancel_order:CancelOrder
    )->Result<()>{
        //TODO  do all checks 

        let removed_leaf = match cancel_order.side{
            Side::Buy=>{
                let bid_account_info = ctx.bids.to_account_info();
                let mut bid_data = bid_account_info.try_borrow_mut_data()?;
                let bid_data_ref:&mut [u8] = &mut **bid_data;
                let bid_slab = Slab::from_bytes_mut(bid_data_ref)?;

                let order_index = bid_slab.find_by_key(cancel_order.order_id).ok_or(PerpError::OrderNotFound)?;
                bid_slab.remove_leaf(order_index)?
            }
            Side::Sell=>{
                let ask_account_info =  ctx.asks.to_account_info();
                let mut ask_data = ask_account_info.try_borrow_mut_data()?;
                let aks_data_ref :&mut[u8] = &mut **ask_data;
                let ask_slab = Slab::from_bytes_mut(aks_data_ref)?;

                let order_index  = ask_slab.find_by_key(cancel_order.order_id).ok_or(PerpError::OrderNotFound)?;
                ask_slab.remove_leaf(order_index)?

            }
        };
        Ok(())
    }



}