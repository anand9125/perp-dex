use anchor_lang::prelude::*;

use crate::{MatchedOrder, Side};

pub struct PositionManager;

impl PositionManager{
    pub fn apply_fill<'info>(
        ctx: &mut crate::instructions::position_ins::PositionIns<'info>,
        event: MatchedOrder,
    ) -> Result<()> {
        let position = &mut ctx.user_position;

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
            position.updated_at = Clock::get()?.unix_timestamp;
            return Ok(());
        }

        // SAME SIDE: Increase position
        if pos_qty.signum() == fill_qty.signum() {
            let old_abs = pos_qty.abs() as i128;
            let add_abs = fill_qty.abs() as i128;
            let new_abs = old_abs + add_abs;

            let new_entry = (entry * old_abs + fill_px * add_abs) / new_abs;

            position.entry_price = new_entry as u64;
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
                fill_px - entry
            } else {
                entry - fill_px
            };

            let realized = price_diff * fill_abs; 

        
            position.realized_pnl = (position.realized_pnl as i128 + realized)
                .try_into()
                .unwrap();

            position.base_position = pos_qty + fill_qty;
            position.updated_at = Clock::get()?.unix_timestamp;
            return Ok(());
        }

        // FULL CLOSE
        if fill_abs == old_abs {
            let price_diff = if pos_qty > 0 {
                fill_px - entry
            } else {
                entry - fill_px
            };
            let realized = price_diff * old_abs;

            position.realized_pnl = (position.realized_pnl as i128 + realized)
                .try_into()
                .unwrap();

            position.base_position = 0;
            position.entry_price = 0;
            position.updated_at = Clock::get()?.unix_timestamp;
            return Ok(());
        }

        // FLIP (fill_abs > old_abs)
        let closed_qty = old_abs;
        let remainder = fill_abs - old_abs;

        // realized pnl on closed part
        let price_diff = if pos_qty > 0 {
            fill_px - entry
        } else {
            entry - fill_px
        };
        let realized = price_diff * closed_qty;

        position.realized_pnl = (position.realized_pnl as i128 + realized)
            .try_into()
            .unwrap();

        // new position opposite direction
        let new_side_qty = if fill_qty > 0 { remainder } else { -remainder };

        position.base_position = new_side_qty as i64;
        position.entry_price = event.fill_price; 
        position.updated_at = Clock::get()?.unix_timestamp;

        Ok(())
    }

}