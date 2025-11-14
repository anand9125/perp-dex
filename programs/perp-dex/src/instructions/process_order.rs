use anchor_lang::{prelude::*};

use anchor_spl::{
    token::{ Token},
    associated_token::AssociatedToken,
};
use crate::{BidAsk, EventQueue, LeafNode, MAX_TO_PROCESS, MarketState, Order, OrderType, PerpError, RequestQueue, Side, Slab};

#[derive(Accounts)]
#[instruction(market_symbol:String)]
pub struct ProcessOrder <'info>{
    #[account(mut)]
    pub authority : Signer<'info>,
    #[account(
        mut,
        seeds = [b"bids",market_symbol.as_bytes()],
        bump
    )]
    pub bids : Account<'info,BidAsk>,
    #[account(
        mut,
        seeds = [b"ask",market_symbol.as_bytes()],
        bump
    )]
    pub asks : Account<'info, BidAsk>,
    #[account(
        mut,
        seeds = [b"market",market_symbol.as_bytes()],
        bump
    )]
    pub market : Account<'info,MarketState>,
    #[account(
        mut,
        seeds = [b"request_queue"],
        bump
    )]
    pub request_queue : Account<'info, RequestQueue>,
    #[account(
        mut,
        seeds = [b"event_queue"],
        bump
    )]
    pub event_queue : Account<'info,EventQueue>,
    pub system_program : Program<'info,System>,
    pub associated_token_program : Program<'info, AssociatedToken>,
    pub token_program : Program<'info,Token>
}
impl <'info> ProcessOrder<'info>{
    pub fn process(
        &mut self,
        order : Order
    )->Result<()>{
        //TODO => Do all checks

        let request_queues = &mut self.request_queue;
        let mut processed : u16 = 0;

        while request_queues.count > 0 && processed < MAX_TO_PROCESS {
            let idx = (request_queues.head % request_queues.capacity) as usize;
            let order = request_queues.requests[idx].clone();
            //matching logic here we will send ordr from here

            request_queues.head = (request_queues.head + 1) % request_queues.capacity;  //If you don’t use modulo, the pointer goes out of bounds.
            request_queues.count -= 1;
            processed += 1 ;

        }
        
        let mut fill:Vec<FillEvent> = Vec::new();
        //TODO get taker/maker fees calculation from global config
        let fee:u8 = 2;
        let current_time =  Clock::get()?.unix_timestamp; 
        let remaining_qty: u64;
        match order.side {
            Side::Buy=>{
                let ask_account_info = &mut self.asks.to_account_info();
                let mut ask_data = ask_account_info.try_borrow_mut_data()?;
                let ask_data_ref: &mut[u8] = &mut **ask_data; 
                let ask_slab = Slab::from_bytes_mut(ask_data_ref)?;
                remaining_qty= Self::match_against_book(
                    ask_slab,
                    &order,
                    &mut fill
                )?;
                //Qty remain mean its limit order put in order book
                if remaining_qty > 0{
                    match order.order_type{
                        OrderType::Limit=>{
                            drop(ask_data); //Release ask

                            let bid_account_info = self.bids.to_account_info();
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
                let bid_account_info = &mut self.asks.to_account_info();
                let mut bid_data = bid_account_info.try_borrow_mut_data()?;
                let bid_data_ref :&mut[u8] =  &mut **bid_data;
                let bid_slab= Slab::from_bytes_mut(bid_data_ref)?;

                remaining_qty = Self::match_against_book(
                    bid_slab,
                    &order,
                    &mut fill
                )?;
                if remaining_qty > 0 {
                    match order.order_type {
                        OrderType::Limit=>{
                            drop(bid_data);
                            let ask_acount_info = self.asks.to_account_info();
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
    fn match_against_book(
        book:&mut Slab,
        order:&Order,
        fills :&mut Vec<FillEvent>
    )->Result<u64>{
            let mut remaining_qty:u64;
            loop{
                remaining_qty = order.qty;
                if remaining_qty == 0 {
                    break ;
                }
                let best_index = match order.side{
                    Side::Buy=>book.find_min(),
                    Side::Sell=>book.find_max()   
                };
                let best_index = match best_index {
                    Some(idx)=>idx,
                    None=>break,  
                };
                let best_leaf = book.nodes[best_index as usize].as_leaf();
                let best_price = best_leaf.price();
                let available_qty = best_leaf.quantity;

                let can_match = match order.order_type {
                    OrderType::Market =>{
                        true  //market order match at any price
                    }
                    OrderType::Limit => {
                        match order.side {
                            Side::Buy=>{
                                order.limit_price >= best_price
                            }
                            Side::Sell=>{
                                order.limit_price <= best_price
                            }
                        }
                    }
                };
                if !can_match {
                    msg!("Price does not cross");
                    break;;
                }
                
                let fill_qty = remaining_qty.min(available_qty);
                let fill_price = best_price;
                
                msg!("excuting fill");

                fills.push(FillEvent { 
                    maker_order_id : best_leaf.key,
                    maker_owner : Pubkey::new_from_array(best_leaf.owner),
                    maker_client_order_id :best_leaf.key,
                    price: fill_price,
                    quantity: fill_qty,
                    
                });
                remaining_qty -= fill_qty;

                if fill_qty >= available_qty {
                    msg!("maker order is fully filled remove from the nodes");
                    book.remove_leaf(best_index)?;
                }else {
                    msg!("maker order is partially filled remove update quantity");
                    let leaf = book.nodes[best_index as usize].as_leaf_mut();
                    leaf.quantity -= fill_qty;
                }
            }
            msg!("matching complete");
        Ok(remaining_qty)

    }
    fn cancel_order (
        &self,
        order: Order
    )->Result<()>{
        //TODO  do all checks 

        let removed_leaf = match order.side{
            Side::Buy=>{
                let bid_account_info = self.bids.to_account_info();
                let mut bid_data = bid_account_info.try_borrow_mut_data()?;
                let bid_data_ref:&mut [u8] = &mut **bid_data;
                let bid_slab = Slab::from_bytes_mut(bid_data_ref)?;

                let order_index = bid_slab.find_by_key(order.order_id).ok_or(PerpError::OrderNotFound)?;
                bid_slab.remove_leaf(order_index)?
            }
            Side::Sell=>{
                let ask_account_info = self.asks.to_account_info();
                let mut ask_data = ask_account_info.try_borrow_mut_data()?;
                let aks_data_ref :&mut[u8] = &mut **ask_data;
                let ask_slab = Slab::from_bytes_mut(aks_data_ref)?;

                let order_index  = ask_slab.find_by_key(order.order_id).ok_or(PerpError::OrderNotFound)?;
                ask_slab.remove_leaf(order_index)?

            }
        };
        Ok(())
    }
    
}

#[derive(Debug, Clone)]
pub struct FillEvent {
    pub maker_order_id: u128,
    pub maker_owner: Pubkey,
    pub maker_client_order_id: u128,
    pub price: u64,
    pub quantity: u64,
}