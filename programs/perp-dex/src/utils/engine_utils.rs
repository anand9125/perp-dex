use anchor_lang::prelude::*;


#[derive(Clone,Copy,Debug)]
pub struct Ratio {
    pub num: u128,
    pub den: u128,
}

impl Ratio {
    pub fn from_bps(bps: u16) -> Self {
        Self {
            num: bps as u128,
            den: 10_000u128,
        }
    }
}



// mmr = 5% → stored as num = 5, den = 100
// mmr = 2.5% → num = 25, den = 1000

//This is used so you can represent decimal percentages without floats.

// Why use rational (num/den) instead of float?
// Because:
// Floating point math is not deterministic across different systems
// On-chain programs must avoid floats entirely
// Using Ratio (num/den) ensures exact math with no rounding surprises