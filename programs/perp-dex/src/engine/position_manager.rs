use anchor_lang::prelude::*;

use crate::{FUNDING_SCALE, MatchedOrder, PerpError, Side};

pub struct PositionManager;

impl PositionManager{
    pub fn apply_fill<'info>(
        ctx: &mut crate::instructions::position_ins::PositionIns<'info>,
        event: MatchedOrder,
    ) -> Result<()> {
        let position = &mut ctx.user_position;
        let user_colletral = &mut ctx.user_colletral;
        
        let pos_qty = position.base_position as i64; 
        let fill_qty = if event.side == Side::Buy {
            event.fill_qty as i64
        } else {
            -(event.fill_qty as i64)
        };
        let entry = position.entry_price as i128;
        let fill_px = event.fill_price as i128;

        if pos_qty == 0 {
            position.base_position = fill_qty;
            position.entry_price = event.fill_price;
            position.realized_pnl = 0; 
            position.last_cum_funding = ctx.market.cum_funding;
            position.updated_at = Clock::get()?.unix_timestamp;
            return Ok(());
        }

        //Add the funding payment calculation here
        let pos_last_cum = position.last_cum_funding;
        let delta_funding = ctx.market.cum_funding.checked_sub(pos_last_cum).ok_or(PerpError::MathOverflow)?;
        // funding_payment_raw = (delta_funding * pos_qty) / SCALE
        let funding_payment = (delta_funding as i128)
            .checked_mul(pos_qty as i128)
            .and_then(|v| v.checked_div(FUNDING_SCALE))
            .ok_or(PerpError::MathOverflow)?;
        
        let new_realized_after_funding = (position.realized_pnl as i128)
            .checked_sub(funding_payment)
            .ok_or(PerpError::MathOverflow)?; // same as adding payment = -funding_payment
    
        position.realized_pnl = i64::try_from(new_realized_after_funding)
            .map_err(|_|PerpError::MathOverflow)?;
        
        user_colletral.collateral_amount = user_colletral.collateral_amount
            .checked_sub(funding_payment)  //moving funding inside the user_colletral
            .ok_or(PerpError::MathOverflow)?;

        position.last_cum_funding = ctx.market.cum_funding;

        // SAME SIDE: Increase position
        if pos_qty.signum() == fill_qty.signum() {
            let old_abs = pos_qty.abs() as i128;
            let add_abs = fill_qty.abs() as i128;
            let new_abs = old_abs
                .checked_add(add_abs)
                .ok_or(PerpError::MathOverflow)?;

           let num = entry
                .checked_mul(old_abs)
                .ok_or(PerpError::MathOverflow)?
                .checked_add(
                    fill_px
                        .checked_mul(add_abs)
                        .ok_or(PerpError::MathOverflow)?
                )
                .ok_or(PerpError::MathOverflow)?;

            let new_entry = num
                .checked_div(new_abs)
                .ok_or(PerpError::MathOverflow)?;

            position.entry_price = u64::try_from(new_entry).map_err(|_| PerpError::MathOverflow)?;
            position.base_position = pos_qty + fill_qty;
            position.updated_at = Clock::get()?.unix_timestamp;
            return Ok(());
        }

        // OPPOSITE SIDE → reduction or flip
        let old_abs = pos_qty.abs() as i128;
        let fill_abs = fill_qty.abs() as i128;

        // PARTIAL REDUCE
        if fill_abs < old_abs {
            // realized pnl = (exit - entry) * closed_qty (long)
            // realized pnl = (entry - exit) * closed_qty (short)
            let price_diff = if pos_qty > 0 {
                fill_px.checked_sub(entry).ok_or(PerpError::MathOverflow)?
            } else {
                entry.checked_sub(fill_px).ok_or(PerpError::MathOverflow)?
            };

            let realized = price_diff
                .checked_mul(fill_abs)
                .ok_or(PerpError::MathOverflow)?;

            let new_realized_i128 = (position.realized_pnl as i128)
                .checked_add(realized)
                .ok_or(PerpError::MathOverflow)?;

        
            position.realized_pnl = i64::try_from(new_realized_i128)
                .map_err(|_| PerpError::MathOverflow)?;

            user_colletral.collateral_amount = user_colletral.collateral_amount
                .checked_add(realized)
                .ok_or(PerpError::MathOverflow)?;


            position.base_position = pos_qty + fill_qty;
            position.updated_at = Clock::get()?.unix_timestamp;
            return Ok(());
        }

        // FULL CLOSE same pnl logic as partial close
        if fill_abs == old_abs {
            let price_diff = if pos_qty > 0 {
                fill_px.checked_sub(entry).ok_or(PerpError::MathOverflow)?
            } else {
                entry.checked_sub(fill_px).ok_or(PerpError::MathOverflow)?
            };

            let realized_i128 = price_diff
                .checked_mul(old_abs)
                .ok_or(PerpError::MathOverflow)?;

            let new_realized_i128 = (position.realized_pnl as i128)
                .checked_add(realized_i128)
                .ok_or(PerpError::MathOverflow)?;

            user_colletral.collateral_amount = user_colletral.collateral_amount
                .checked_add(realized_i128)
                .ok_or(PerpError::MathOverflow)?;

            position.realized_pnl = i64::try_from(new_realized_i128)
                .map_err(|_| PerpError::MathOverflow)?;

            position.base_position = 0;
            position.entry_price = 0;
            position.updated_at = Clock::get()?.unix_timestamp;
            return Ok(());
        }

        // FLIP (fill_abs > old_abs)
        let closed_qty = old_abs;
        let remainder = fill_abs
            .checked_sub(old_abs)
            .ok_or(PerpError::MathOverflow)?;

        let price_diff = if pos_qty > 0 {
            fill_px.checked_sub(entry).ok_or(PerpError::MathOverflow)?
        } else {
            entry.checked_sub(fill_px).ok_or(PerpError::MathOverflow)?
        };

        let realized_i128 = price_diff
            .checked_mul(closed_qty)
            .ok_or(PerpError::MathOverflow)?;

        let new_realized_i128 = (position.realized_pnl as i128)
            .checked_add(realized_i128)
            .ok_or(PerpError::MathOverflow)?;

        user_colletral.collateral_amount = user_colletral.collateral_amount
            .checked_add(realized_i128)
            .ok_or(PerpError::MathOverflow)?;

        position.realized_pnl = i64::try_from(new_realized_i128)
            .map_err(|_| PerpError::MathOverflow)?;

        // new position opposite direction
        let new_side_qty = if fill_qty > 0 {
            remainder
        } else {
            -remainder
        };

        position.base_position = new_side_qty as i64;
        position.entry_price = event.fill_price;
        // make sure funding index is fresh for the new (flipped) pos
        position.last_cum_funding = ctx.market.cum_funding;
        position.updated_at = Clock::get()?.unix_timestamp;

        Ok(())
    }
}