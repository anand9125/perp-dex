
use std::ops::{Div, Mul, Sub};

use anchor_lang::prelude::*;

use crate::{PerpError, Ratio};

pub fn notional(qty_signed: i128, price: u128) -> Result<u128> {
    if qty_signed == 0 || price == 0 {
        return Ok(0);
    }

    let qty_abs = qty_signed.unsigned_abs();

    qty_abs
        .checked_mul(price)
        .ok_or_else(|| error!(PerpError::MathOverflow))
}


pub fn unrealized_pnl(qty_signed:i128,entry_price:u128,mark_price: u128)->Result<i128>{

    if qty_signed == 0 {
        return Ok(0);
    }
    let entry = entry_price as i128;
    let mark = mark_price as i128;
    //for long qty > 0 ;
    //for short qty < 0;
    let diff = mark.checked_sub(entry).ok_or_else(||error!(PerpError::MathOverflow))?;
    diff.checked_mul(qty_signed).ok_or_else(||error!(PerpError::MathOverflow))
}

//motional*mmr
pub fn maintenance_margin(
    qty_signed: i128,
    price: u128,
    mmr: Ratio,
) -> Result<u128> {
    let not = notional(qty_signed, price)?;

    let x = not
        .checked_mul(mmr.num)
        .ok_or_else(|| error!(PerpError::MathOverflow))?;

    x.checked_div(mmr.den)
        .ok_or_else(|| error!(PerpError::MathOverflow))
}


//This function computes your account health, which determines whether the trader is safe or ready for liquidation.
pub fn account_health_single( 
    collateral: i128,
    realized_pnl : i128,
    qty_signed: i128,
    entry_price:u128,
    mark_price: u128,
    mmr: Ratio
)->Result<i128>{
    let unrealized_pnl = unrealized_pnl(qty_signed, entry_price, mark_price)?;
    let maintance_margin = maintenance_margin(qty_signed, entry_price, mmr)? as i128;

    collateral
    .checked_add(realized_pnl)
    .and_then(|v|v.checked_add(unrealized_pnl))
    .and_then(|v|v.checked_sub(maintance_margin))
    .ok_or(PerpError::MathOverflow.into())

}


pub fn is_liquidatable_single(
    collateral: i128,
    realized_pnl : i128,
    qty_signed: i128,
    entry_price:u128,
    mark_price: u128,
    mmr: Ratio,
) -> Result<bool> {
    let health = account_health_single(
        collateral,
        realized_pnl,
        qty_signed,
        entry_price,
        mark_price,
        mmr,
    )?;
    Ok(health <= 0)
}
