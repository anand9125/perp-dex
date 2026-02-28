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
    /// Apply a fill event using current chain time.
    pub fn apply_fill(
        market: &mut MarketState,
        position: &mut Position,
        user_collateral: &mut UserCollateral,
        event: MatchedOrder,
    ) -> Result<()> {
        let now_secs = Clock::get()?.unix_timestamp;
        Self::apply_fill_with_time(market, position, user_collateral, event, now_secs)
    }

    /// Apply a fill event with explicit timestamp. Used for testing.
    pub fn apply_fill_with_time(
        market: &mut MarketState,
        position: &mut Position,
        user_collateral: &mut UserCollateral,
        event: MatchedOrder,
        now_secs: i64,
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
            position.updated_at = now_secs;
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
            position.updated_at = now_secs;
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
            position.updated_at = now_secs;
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
            position.updated_at = now_secs;
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
        position.updated_at = now_secs;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{OrderStatus, OrderType, Side};
    use anchor_lang::prelude::Pubkey;

    fn user_pubkey() -> Pubkey {
        Pubkey::new_from_array([1u8; 32])
    }

    fn market_pubkey() -> Pubkey {
        Pubkey::new_from_array([2u8; 32])
    }

    fn make_position(owner: Pubkey, market: Pubkey, base: i64, entry: u64, last_cum_funding: i64) -> Position {
        Position {
            owner,
            market,
            order_id: 0,
            side: Side::Buy,
            price: 0,
            qty: 0,
            order_type: OrderType::Limit,
            status: OrderStatus::Pending,
            base_position: base,
            entry_price: entry,
            realized_pnl: 0,
            last_cum_funding,
            initial_margin: 0,
            leverage: 0,
            flags: 0,
            created_at: 0,
            updated_at: 0,
        }
    }

    fn make_market(cum_funding: i64) -> MarketState {
        MarketState {
            symbol: "BTC".to_string(),
            authority: Pubkey::default(),
            oracle_pubkey: Pubkey::default(),
            last_oracle_price: 100_000,
            last_oracle_ts: 0,
            bid: Pubkey::default(),
            asks: Pubkey::default(),
            im_bps: 500,
            mm_bps: 250,
            taker_fee_bps: 5,
            maker_fee_bps: 2,
            liquidator_share_bps: 50,
            liq_penalty_bps: 500,
            oracle_band_bps: 100,
            cum_funding,
            last_funding_ts: 0,
            max_funding_rate: 0,
            funding_interval_secs: 3600,
            tick_size: 1,
            step_size: 1,
            min_order_notional: 1000,
            bump: 0,
        }
    }

    fn make_collateral(owner: Pubkey, amount: i128) -> UserCollateral {
        UserCollateral {
            owner,
            collateral_amount: amount,
            last_updated: 0,
        }
    }

    fn make_fill_event(side: Side, price: u64, qty: u64, user: [u8; 32]) -> MatchedOrder {
        MatchedOrder {
            is_maker: false,
            order_id: 0,
            user,
            fill_price: price,
            fill_qty: qty,
            side,
            timestamp: 1000,
        }
    }

    #[test]
    fn test_apply_fill_open_long() {
        let user = user_pubkey();
        let market_pk = market_pubkey();
        let mut market = make_market(0);
        let mut position = make_position(user, market_pk, 0, 0, 0);
        let mut collateral = make_collateral(user, 10_000);

        let ev = make_fill_event(Side::Buy, 100, 10, user.to_bytes());
        PositionManager::apply_fill_with_time(&mut market, &mut position, &mut collateral, ev, 1000).unwrap();

        assert_eq!(position.base_position, 10);
        assert_eq!(position.entry_price, 100);
        assert_eq!(position.realized_pnl, 0);
        assert_eq!(position.last_cum_funding, 0);
        assert_eq!(collateral.collateral_amount, 10_000);
    }

    #[test]
    fn test_apply_fill_add_to_long() {
        let user = user_pubkey();
        let market_pk = market_pubkey();
        let mut market = make_market(0);
        let mut position = make_position(user, market_pk, 10, 100, 0);
        let mut collateral = make_collateral(user, 10_000);

        let ev = make_fill_event(Side::Buy, 120, 5, user.to_bytes());
        PositionManager::apply_fill_with_time(&mut market, &mut position, &mut collateral, ev, 1000).unwrap();

        assert_eq!(position.base_position, 15);
        assert_eq!(position.entry_price, 106);
        assert_eq!(position.realized_pnl, 0);
        assert_eq!(collateral.collateral_amount, 10_000);
    }

    #[test]
    fn test_apply_fill_partial_close_long_profit() {
        let user = user_pubkey();
        let market_pk = market_pubkey();
        let mut market = make_market(0);
        let mut position = make_position(user, market_pk, 10, 100, 0);
        let mut collateral = make_collateral(user, 10_000);

        let ev = make_fill_event(Side::Sell, 120, 5, user.to_bytes());
        PositionManager::apply_fill_with_time(&mut market, &mut position, &mut collateral, ev, 1000).unwrap();

        assert_eq!(position.base_position, 5);
        assert_eq!(position.entry_price, 100);
        assert_eq!(position.realized_pnl, 100);
        assert_eq!(collateral.collateral_amount, 10_100);
    }

    #[test]
    fn test_apply_fill_full_close_long() {
        let user = user_pubkey();
        let market_pk = market_pubkey();
        let mut market = make_market(0);
        let mut position = make_position(user, market_pk, 10, 100, 0);
        let mut collateral = make_collateral(user, 10_000);

        let ev = make_fill_event(Side::Sell, 120, 10, user.to_bytes());
        PositionManager::apply_fill_with_time(&mut market, &mut position, &mut collateral, ev, 1000).unwrap();

        assert_eq!(position.base_position, 0);
        assert_eq!(position.entry_price, 0);
        assert_eq!(position.realized_pnl, 200);
        assert_eq!(collateral.collateral_amount, 10_200);
    }
}