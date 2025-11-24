use anchor_lang::prelude::*;

use crate::{
    FUNDING_SCALE,
    MatchedOrder,
    PerpError,
    Side,
    MarketState,
    Position,
    UserCollateral,
};

pub struct PositionManager;

impl PositionManager {
    pub fn apply_fill(
        market: &mut MarketState,
        position: &mut Position,
        user_collateral: &mut UserCollateral,
        event: MatchedOrder,
    ) -> Result<()> {
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
            position.last_cum_funding = market.cum_funding;
            position.updated_at = Clock::get()?.unix_timestamp;
            return Ok(());
        }

        let pos_last_cum = position.last_cum_funding;
        let delta_funding = market
            .cum_funding
            .checked_sub(pos_last_cum)
            .ok_or(PerpError::MathOverflow)?;

        let funding_payment = (delta_funding as i128)
            .checked_mul(pos_qty as i128)
            .and_then(|v| v.checked_div(FUNDING_SCALE))
            .ok_or(PerpError::MathOverflow)?;

        let new_realized_after_funding = (position.realized_pnl as i128)
            .checked_sub(funding_payment)
            .ok_or(PerpError::MathOverflow)?;

        position.realized_pnl = i64::try_from(new_realized_after_funding)
            .map_err(|_| PerpError::MathOverflow)?;

        user_collateral.collateral_amount = user_collateral
            .collateral_amount
            .checked_sub(funding_payment) // paying funding if funding_payment > 0, receiving if < 0
            .ok_or(PerpError::MathOverflow)?;

        position.last_cum_funding = market.cum_funding;

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
                        .ok_or(PerpError::MathOverflow)?,
                )
                .ok_or(PerpError::MathOverflow)?;

            let new_entry = num
                .checked_div(new_abs)
                .ok_or(PerpError::MathOverflow)?;

            position.entry_price = u64::try_from(new_entry)
                .map_err(|_| PerpError::MathOverflow)?;
            position.base_position = pos_qty + fill_qty;
            position.updated_at = Clock::get()?.unix_timestamp;
            return Ok(());
        }

        let old_abs = pos_qty.abs() as i128;
        let fill_abs = fill_qty.abs() as i128;

        if fill_abs < old_abs {
            // long: realized = (exit - entry) * closed_qty
            // short: realized = (entry - exit) * closed_qty
            let price_diff = if pos_qty > 0 {
                fill_px
                    .checked_sub(entry)
                    .ok_or(PerpError::MathOverflow)?
            } else {
                entry
                    .checked_sub(fill_px)
                    .ok_or(PerpError::MathOverflow)?
            };

            let realized = price_diff
                .checked_mul(fill_abs)
                .ok_or(PerpError::MathOverflow)?;

            let new_realized_i128 = (position.realized_pnl as i128)
                .checked_add(realized)
                .ok_or(PerpError::MathOverflow)?;

            position.realized_pnl = i64::try_from(new_realized_i128)
                .map_err(|_| PerpError::MathOverflow)?;

            user_collateral.collateral_amount = user_collateral
                .collateral_amount
                .checked_add(realized)
                .ok_or(PerpError::MathOverflow)?;

            position.base_position = pos_qty + fill_qty;
            position.updated_at = Clock::get()?.unix_timestamp;
            return Ok(());
        }

        //FULL CLOSE 
        if fill_abs == old_abs {
            let price_diff = if pos_qty > 0 {
                fill_px
                    .checked_sub(entry)
                    .ok_or(PerpError::MathOverflow)?
            } else {
                entry
                    .checked_sub(fill_px)
                    .ok_or(PerpError::MathOverflow)?
            };

            let realized_i128 = price_diff
                .checked_mul(old_abs)
                .ok_or(PerpError::MathOverflow)?;

            let new_realized_i128 = (position.realized_pnl as i128)
                .checked_add(realized_i128)
                .ok_or(PerpError::MathOverflow)?;

            user_collateral.collateral_amount = user_collateral
                .collateral_amount
                .checked_add(realized_i128)
                .ok_or(PerpError::MathOverflow)?;

            position.realized_pnl = i64::try_from(new_realized_i128)
                .map_err(|_| PerpError::MathOverflow)?;

            position.base_position = 0;
            position.entry_price = 0;
            position.updated_at = Clock::get()?.unix_timestamp;
            return Ok(());
        }

        //FLIP (fill_abs > old_abs) 
        let closed_qty = old_abs;
        let remainder = fill_abs
            .checked_sub(old_abs)
            .ok_or(PerpError::MathOverflow)?;

        let price_diff = if pos_qty > 0 {
            fill_px
                .checked_sub(entry)
                .ok_or(PerpError::MathOverflow)?
        } else {
            entry
                .checked_sub(fill_px)
                .ok_or(PerpError::MathOverflow)?
        };

        let realized_i128 = price_diff
            .checked_mul(closed_qty)
            .ok_or(PerpError::MathOverflow)?;

        let new_realized_i128 = (position.realized_pnl as i128)
            .checked_add(realized_i128)
            .ok_or(PerpError::MathOverflow)?;

        user_collateral.collateral_amount = user_collateral
            .collateral_amount
            .checked_add(realized_i128)
            .ok_or(PerpError::MathOverflow)?;

        position.realized_pnl = i64::try_from(new_realized_i128)
            .map_err(|_| PerpError::MathOverflow)?;

        // new position in opposite direction
        let new_side_qty = if fill_qty > 0 {
            remainder
        } else {
            -remainder
        };

        position.base_position = new_side_qty as i64;
        position.entry_price = event.fill_price;
        position.last_cum_funding = market.cum_funding;
        position.updated_at = Clock::get()?.unix_timestamp;

        Ok(())
    }
}