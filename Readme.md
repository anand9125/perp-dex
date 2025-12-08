# PerDEX — Decentralized Perpetual Futures Exchange

![Rust](https://img.shields.io/badge/rust-%23000000.svg?style=for-the-badge&logo=rust&logoColor=white)
![Solana](https://img.shields.io/badge/solana-4E44CE?style=for-the-badge&logo=solana&logoColor=white)
![Anchor](https://img.shields.io/badge/anchor-4E44CE?style=for-the-badge&logo=solana&logoColor=white)

A high-performance decentralized perpetual futures exchange built on Solana, implementing a complete on-chain trading architecture with slab-based orderbook, matching engine, margin system, and liquidation mechanisms.

## 🎯 Overview

PerDEX is a fully decentralized perpetual futures exchange (DEX) on Solana that enables traders to open leveraged long and short positions on crypto assets without centralized custody or intermediaries. Built with Rust and Anchor framework, it implements the complete infrastructure needed for a production-grade perpetual DEX, following Serum's CLOB architecture and Solana's account model.

### Why Decentralized?

- **Non-Custodial**: Users maintain full control of their funds at all times
- **Transparent**: All trades, liquidations, and settlements occur on-chain
- **Permissionless**: Anyone can trade without KYC or geographic restrictions
- **Censorship-Resistant**: No single entity can halt trading or freeze accounts
- **Trustless**: Smart contracts enforce all rules deterministically

### Design Philosophy

- **On-Chain Orderbook**: Complete CLOB implementation living on Solana
- **Deterministic Execution**: All operations produce consistent, reproducible results
- **Solana-Optimized**: Leverages PDAs, zero-copy deserialization, and parallel transaction processing
- **Capital Efficient**: Cross-margining and portfolio-level risk management
- **Production-Ready**: Request/event queue pipeline for scalable order processing

## ✨ Key Features

### 1. Decentralized Slab-Based Orderbook

The on-chain orderbook implements a Serum-inspired slab structure:

- **On-Chain State**: Entire orderbook stored in Solana account data
- **B-Tree Arena Storage**: Nodes stored contiguously for efficient on-chain access
- **O(log n) Operations**: Efficient insert, delete, and price discovery within compute budget
- **Price-Time Priority**: Deterministic matching order enforced by blockchain
- **Zero-Copy Access**: Direct memory mapping for gas-efficient operations

```rust
#[account(zero_copy)]
pub struct OrderbookSlab {
    pub nodes: [SlabNode; MAX_NODES],
    pub free_list_head: Option<u32>,
    pub root: Option<u32>,
    pub bid_best: Option<u32>,
    pub ask_best: Option<u32>,
}
```

### 2. On-Chain Request → Cranker → Event Queue Pipeline

Decentralized order processing following Solana's compute model:

```
User Transaction → Request Queue (PDA) → Cranker (Permissionless) → Matching Engine → Event Queue (PDA) → Settlement
```

- **Request Queue**: On-chain buffer for incoming order instructions
- **Permissionless Cranking**: Anyone can call the crank instruction for rewards
- **Compute-Aware Batching**: Processes multiple orders within transaction limits
- **Event Queue**: On-chain log of fills and cancellations for indexers
- **Deterministic Processing**: Blockchain consensus ensures reproducibility

### 3. On-Chain Matching Engine

Full-featured matching engine implemented in Anchor program:

#### Order Types
- **LIMIT**: Price-specified orders with post-only, IOC, FOK options
- **MARKET**: Execute immediately at best available on-chain price
- **STOP-LIMIT**: Triggered orders (optional, via oracle integration)

#### Matching Features
- Price-time priority execution enforced on-chain
- Partial fill support with state tracking
- Maker/taker fee differentiation
- Self-trade prevention (same owner check)
- Cross-program composability

```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum OrderType {
    Limit { price: u64, post_only: bool },
    Market,
}

#[account]
pub struct Order {
    pub owner: Pubkey,
    pub order_id: u128,
    pub side: Side,
    pub order_type: OrderType,
    pub size: u64,
    pub filled: u64,
    pub timestamp: i64,
}
```

### 4. Decentralized Margin and Position Tracking

On-chain risk management without trusted intermediaries:

#### Position Management (Per-Market PDAs)
- Long/short position tracking in program-derived accounts
- Entry price calculation on-chain (FIFO, weighted average)
- Unrealized PnL based on oracle price feeds (Pyth/Switchboard)
- Realized PnL on position closure

#### Margin Requirements
- **Initial Margin (IM)**: Collateral required to open positions
- **Maintenance Margin (MM)**: Minimum collateral to avoid liquidation
- **Cross-Margin**: Shared collateral across all positions
- **Portfolio Margining**: Net position risk calculation

```rust
#[account]
pub struct UserPosition {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub size: i64,              // Positive = long, negative = short
    pub entry_price: u64,       
    pub collateral: u64,        // Posted collateral
    pub unrealized_pnl: i64,    
    pub realized_pnl: i64,
    pub last_funding_index: u64,
    pub bump: u8,
}
```

### 5. Trustless Liquidation Engine

Permissionless liquidation mechanism:

- **Oracle-Based Monitoring**: Uses Pyth/Switchboard price feeds for mark price
- **Liquidation Triggers**: Any user can call liquidate instruction when conditions met
- **Liquidator Incentives**: Liquidators earn portion of liquidation penalty
- **Insurance Fund**: On-chain PDA accumulating penalties and covering losses
- **Backstop Mechanism**: Protocol-level protection against cascading liquidations

```rust
pub fn liquidate(ctx: Context<Liquidate>) -> Result<()> {
    let position = &mut ctx.accounts.position;
    let oracle_price = ctx.accounts.oracle.get_price()?;
    
    require!(
        position.margin_ratio(oracle_price) < MAINTENANCE_MARGIN_RATIO,
        ErrorCode::PositionNotLiquidatable
    );
    
    // Transfer liquidation penalty to liquidator and insurance fund
    // Close position at oracle price
    // Emit liquidation event
}
```

### 6. On-Chain Wallet and Balance Settlement

Decentralized account management:

- SPL token vault accounts for collateral (USDC, SOL, etc.)
- Atomic trade settlement via CPI to token program
- Fee collection to protocol treasury PDA
- Funding payment processing every 8 hours
- Withdrawal permissions enforced by margin checks

### 7. Optimized Solana Architecture

Built for on-chain performance:

- **Anchor Framework**: Type-safe program development with automatic account validation
- **Zero-Copy Deserialization**: Direct account data access without deserialization cost
- **Parallel Transaction Processing**: Independent accounts enable concurrent execution
- **Compute-Optimized**: Batched operations to maximize compute units
- **Account Layout**: Strategic use of PDAs for deterministic addressing

## 📁 Project Structure

```
perdex/
├── programs/
│   └── perdex/
│       └── src/
│           ├── lib.rs              # Program entry & instruction handlers
│           ├── state/              # Account structures
│           │   ├── orderbook.rs    # Orderbook slab state
│           │   ├── position.rs     # User position accounts
│           │   ├── market.rs       # Market configuration
│           │   └── queues.rs       # Request/event queues
│           │
│           ├── instructions/       # Instruction handlers
│           │   ├── initialize.rs   # Market initialization
│           │   ├── place_order.rs  # Submit orders
│           │   ├── cancel_order.rs # Cancel orders
│           │   ├── crank.rs        # Process request queue
│           │   ├── settle.rs       # Settle trades
│           │   └── liquidate.rs    # Liquidation logic
│           │
│           ├── engine/             # Core matching logic
│           │   ├── matcher.rs      # Order matching algorithm
│           │   └── slab.rs         # Slab operations
│           │
│           ├── margin/             # Risk calculations
│           │   ├── calculator.rs
│           │   └── oracle.rs       # Price feed integration
│           │
│           └── errors.rs           # Custom error codes
│
├── app/                            # Frontend (React + Wallet adapters)
├── tests/                          # Anchor integration tests
├── scripts/                        # Deployment & setup scripts
├── Anchor.toml                     # Anchor configuration
├── Cargo.toml
└── README.md
```

## 🔄 Decentralized System Flow

### Complete On-Chain Order Lifecycle

```
┌──────────────────┐
│  User's Wallet   │
│  Signs TX        │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Place Order IX   │◄─── Anchor instruction
│ (On-Chain)       │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Request Queue   │◄─── PDA account stores pending orders
│  (PDA)           │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Crank IX        │◄─── Anyone can call (permissionless)
│  (Keeper/User)   │     Earns crank fee
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Matching Engine  │◄─── Executes on-chain
│ (Smart Contract) │     Updates orderbook slab
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│   Event Queue    │◄─── PDA stores fill events
│   (PDA)          │     Consumed by indexers
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Position Update  │◄─── Updates user position PDA
│ (PDA)            │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Oracle Check     │◄─── Pyth/Switchboard for mark price
│ (Pyth/Switch)    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Liquidation IX   │◄─── If underwater (permissionless)
│ (Anyone)         │     Liquidator earns reward
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ SPL Token CPI    │◄─── Atomic settlement
│ (Settlement)     │
└──────────────────┘
```

### Program Derived Addresses (PDAs)

```rust
// Market PDA
[b"market", market_index.to_le_bytes()]

// User Position PDA
[b"position", user.key(), market.key()]

// Orderbook Slab PDA
[b"orderbook", market.key()]

// Request Queue PDA
[b"request_queue", market.key()]

// Event Queue PDA
[b"event_queue", market.key()]

// Vault PDA (holds user collateral)
[b"vault", market.key()]

// Insurance Fund PDA
[b"insurance", market.key()]
```

## 🚀 Getting Started

### Prerequisites

- Rust 1.70 or higher
- Solana CLI 1.17+
- Anchor 0.29+
- Node.js 18+ (for tests and frontend)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/perdex.git
cd perdex

# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install latest
avm use latest

# Build the program
anchor build

# Run tests
anchor test
```

### Local Deployment

```bash
# Start local validator
solana-test-validator

# Deploy program (in another terminal)
anchor deploy

# Initialize market
anchor run initialize-market

# Start cranker bot
npm run cranker
```

### Program Interaction Example

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PerDEX } from "../target/types/per_dex";

// Connect to devnet
const connection = new anchor.web3.Connection("https://api.devnet.solana.com");
const wallet = anchor.Wallet.local();
const provider = new anchor.AnchorProvider(connection, wallet, {});
const program = anchor.workspace.PerDEX as Program<PerDEX>;

// Place a limit order
const [positionPda] = await anchor.web3.PublicKey.findProgramAddress(
  [Buffer.from("position"), wallet.publicKey.toBuffer(), market.toBuffer()],
  program.programId
);

await program.methods
  .placeOrder({
    side: { bid: {} },
    orderType: { limit: { price: new anchor.BN(50000), postOnly: false } },
    size: new anchor.BN(100),
  })
  .accounts({
    user: wallet.publicKey,
    position: positionPda,
    market: marketPda,
    requestQueue: requestQueuePda,
    // ... other accounts
  })
  .rpc();

// Check position
const position = await program.account.userPosition.fetch(positionPda);
console.log("Position:", position.size.toString(), "@", position.entryPrice.toString());
```

## 🧪 Testing

Run comprehensive on-chain tests:

```bash
# Run all Anchor tests
anchor test

# Run specific test file
anchor test --test matching_tests

# Run tests on devnet
anchor test --provider.cluster devnet

# Run with detailed logs
RUST_LOG=debug anchor test
```

### Test Coverage

- Unit tests for slab operations (off-chain)
- Integration tests for complete order flow (on-chain)
- Liquidation scenario tests
- Margin calculation tests
- Concurrent order tests

## 📊 On-Chain Performance

Expected performance characteristics on Solana:

- **Order Placement**: ~400ms (network + confirmation)
- **Matching**: 1-10 orders per crank (compute limit dependent)
- **Settlement**: Atomic within transaction
- **Throughput**: 2000-3000 TPS (Solana network limit)
- **Finality**: ~13 seconds (confirmed), ~30 seconds (finalized)

## 🔧 Market Configuration

Markets are configured via on-chain accounts:

```rust
#[account]
pub struct Market {
    pub authority: Pubkey,
    pub oracle: Pubkey,              // Pyth/Switchboard price feed
    pub base_symbol: String,         // e.g., "BTC"
    pub quote_symbol: String,        // e.g., "USDC"
    pub maker_fee_bps: u16,          // 2 bps
    pub taker_fee_bps: u16,          // 5 bps
    pub initial_margin_ratio: u16,   // 1000 = 10% (10x leverage)
    pub maintenance_margin_ratio: u16, // 500 = 5%
    pub liquidation_penalty_bps: u16,  // 50 bps
    pub max_leverage: u8,            // e.g., 20x
    pub funding_period: i64,         // 8 hours
    pub vault: Pubkey,               // SPL token vault
    pub insurance_fund: Pubkey,
    pub orderbook: Pubkey,
    pub request_queue: Pubkey,
    pub event_queue: Pubkey,
}
```

## 🤖 Keeper Bots (Decentralization in Practice)

The protocol requires permissionless keepers:

### Cranker Bot
- Monitors request queue
- Calls crank instruction
- Earns crank fees
- Anyone can run

### Liquidator Bot
- Monitors positions via RPC
- Calls liquidate instruction when margin insufficient
- Earns liquidation rewards
- Competitive market for liquidations

### Funding Rate Bot
- Calls update_funding instruction every 8 hours
- Permissionless trigger
- Can be incentivized or run by protocol

## 🔐 Security Considerations

### Audits Required

This code is for educational purposes and requires professional audits before mainnet deployment.

### Key Security Measures

- **Access Control**: Anchor's account constraints prevent unauthorized access
- **Oracle Manipulation**: Price bands and TWAP to prevent flash crashes
- **Reentrancy**: Solana's single-threaded execution prevents reentrancy
- **Integer Overflow**: Checked arithmetic throughout
- **Signer Verification**: All user actions require wallet signature

## 🗺️ Roadmap

- [x] Core orderbook and matching engine
- [x] Margin system and liquidations
- [ ] Oracle integration (Pyth Network)
- [ ] Frontend trading interface
- [ ] Keeper bot infrastructure
- [ ] Multi-collateral support
- [ ] Funding rate mechanism
- [ ] Orderbook depth API
- [ ] Historical data indexer
- [ ] Security audit
- [ ] Mainnet deployment

## 🤝 Contributing

Contributions welcome! Areas for improvement:

- Optimize compute usage in matching algorithm
- Improve slab memory efficiency
- Add more order types (trailing stop, iceberg)
- Build subgraph/indexer for historical data
- Develop UI components
- Write keeper bot examples

Please open an issue before starting major work.

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **Serum DEX**: Pioneer of on-chain CLOB on Solana
- **Mango Markets**: Advanced perpetuals margin system
- **Drift Protocol**: Innovative hybrid orderbook approach
- **Anchor Framework**: Making Solana development accessible

## 📚 Resources

- [Anchor Documentation](https://www.anchor-lang.com/)
- [Solana Cookbook](https://solanacookbook.com/)
- [Serum Developer Resources](https://docs.projectserum.com/)
- [Pyth Network](https://pyth.network/) - Oracle integration
- [Perpetual Futures Mechanics](https://www.paradigm.xyz/2021/05/everlasting-options)

## 🌐 Community

- Twitter: [@PerDEX](https://twitter.com/perdex)
- Discord: [Join our community](https://discord.gg/perdex)
- Documentation: [docs.perdex.io](https://docs.perdex.io)

---

**⚠️ Disclaimer**: This is experimental software for educational purposes. Use at your own risk. Not audited. Not financial advice. This protocol enables decentralized perpetual futures trading without intermediaries, putting full control and responsibility in the hands of users.