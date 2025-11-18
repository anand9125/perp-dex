
use anchor_lang::prelude::*;

use crate::{MarketState, PerpError};

pub const INTEREST_RATE_BPS: i128 = 333;
pub const FUNDING_SCALE: i128 = 1_000_000_000; // 1e9
pub const STANDARD_FUNDING_PERIOD: i64 = 8 * 3600;


pub fn compute_funding_rate (
    mark_price : u128,
    oracal_price: u128,
    funding_interval : i64
)->Result<i128>{
    require!(oracal_price>0,PerpError::InvalidOraclePrice);
    require!(funding_interval>0,PerpError::MathOverflow);

    let mark_i = mark_price as i128;
    let oracle_i = oracal_price as i128;
    let price_diff = mark_i
        .checked_sub(oracle_i)
        .ok_or(PerpError::MathOverflow)?;

    let premium = price_diff
        .checked_mul(FUNDING_SCALE)
        .and_then(|v|v.checked_div(oracle_i))
        .ok_or(PerpError::MathOverflow)?;

    let intrest = (INTEREST_RATE_BPS)
        .checked_mul(FUNDING_SCALE)
        .and_then(|v|v.checked_div(10000))
        .ok_or(PerpError::MathOverflow)?;
        //why intrest => if mark==oracle
        //prem =0 and fund = 0,
        //this cause ,funding system inactive

    let funding_rate = premium
        .checked_add(intrest)
        .ok_or(PerpError::MathOverflow)?;

    let time_scaled_rate = funding_rate
        .checked_mul(funding_interval as i128)
        .and_then(|v|v.checked_div(STANDARD_FUNDING_PERIOD as i128))
        .ok_or(PerpError::MathOverflow)?;
    Ok(time_scaled_rate)

}

pub fn clamp_funding_rate(  
    funding_rate : i128,
    max_funding_rate: i128
)->Result<i128>{
    let max_cap = max_funding_rate 
        .checked_mul(FUNDING_SCALE)
        .and_then(|v|v.checked_div(10000))
        .ok_or(PerpError::MathOverflow)?;

    Ok(funding_rate.clamp(-max_cap, max_cap))
}

pub fn update_funding(
    market: &mut Account<MarketState>,
    mark_price : u128,
    oracal_price: u128,
    current_ts : i64
)->Result<()>{
    require!(current_ts >= market.last_funding_ts, PerpError::InvalidTimestamp);
    let interval = market.funding_interval_secs as i64;
    require!(interval > 0, PerpError::InvalidMarketConfig);

    let elapsed = current_ts
        .checked_sub(market.last_funding_ts)
        .ok_or(PerpError::MathOverflow)?;

    require!(elapsed >= interval, PerpError::FundingNotDue);

    let funding_rate = compute_funding_rate(
        mark_price,
        oracal_price,
        interval
    )?;

    let capped_rate = clamp_funding_rate(
        funding_rate,
        market.max_funding_rate as i128
    )?;

    market.cum_funding = market.cum_funding
        .checked_add(
            capped_rate as i64
        )
        .ok_or(PerpError::MathOverflow)?;
    market.last_funding_ts = current_ts;
    Ok(())
}