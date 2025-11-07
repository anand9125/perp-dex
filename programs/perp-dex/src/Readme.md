# last_cum_funding_long: 

When a user opens or updates a position:

You store the current market’s cumulative funding index in their position:

position.last_cum_funding_long = market.cum_funding_long;
position.last_cum_funding_short = market.cum_funding_short;


That snapshot marks “the funding level when this trader’s position started (or was last updated)”.

✅ Then, later (when closing or settling funding)

When the user closes the position or funding is updated:

You compare the market’s current cumulative funding index with what was stored before.

The difference tells you how much funding has accrued while they held the position.

Say:
When position opened:
    market.cum_funding_long = 0.0010
    position.last_cum_funding_long = 0.0010

Later (hours later):
    market.cum_funding_long = 0.0025


Now : 
funding_diff = 0.0025 - 0.0010 = 0.0015
funding_payment = base_position * funding_diff

If the trader was long, they pay that funding (since perp > spot).
If they were short, they’d receive it (and you’d use last_cum_funding_short instead).

So in plain English

last_cum_funding_long and last_cum_funding_short store the market’s cumulative funding value at the time the user last updated their position.
Later, by comparing the current funding index with that stored one, you can calculate exactly how much funding they owe or should receive.
