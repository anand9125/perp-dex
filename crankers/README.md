# Perp DEX Off-Chain Crankers

Three separate Node scripts that run in a loop and interact with the on-chain perp-dex program:

1. **Request cranker** – When `request_queue.count > 0`, calls `process_place_order` for each configured market (up to 10 requests per call per market).
2. **Event cranker** – When `event_queue.count > 0`, peeks the head event to get the user pubkey, then calls `position_manager(user)` for each market until the head event is consumed.
3. **Liquidator** – Fetches all positions with `base_position != 0`, computes health (collateral + unrealized PnL − maintenance margin) using the same formula as the on-chain `RiskEngine`, and calls `liquidate` when health < 0.

## Setup

From repo root (or from `crankers/`):

```bash
cd crankers
npm install
npm run build
```

Ensure the on-chain IDL is at `target/idl/perp_dex.json` (e.g. after `anchor build`).

## Environment

- **RPC_URL** – Solana RPC (default: `https://api.devnet.solana.com`).
- **CRANKER_AUTHORITY_KEYPAIR** – (Optional) JSON array or base64 keypair for request and event crankers. If unset, uses **ANCHOR_WALLET** or `~/.config/solana/id.json`.
- **LIQUIDATOR_KEYPAIR** – (Optional) Keypair for the liquidator (signer and reward recipient). If unset, uses the same as above.
- **MARKET_SYMBOLS** – (Optional) Comma-separated market symbols (e.g. `SOL-PERP,BTC-PERP`). If unset, both crankers fetch all markets from chain.
- **CRANK_POLL_MS** – (Optional) Poll interval in ms for request/event crankers (default: 2000).
- **LIQUIDATOR_POLL_MS** – (Optional) Poll interval for liquidator (default: 5000).

## Run

From `crankers/`:

```bash
# Request queue → process_place_order (one process)
RPC_URL=https://api.devnet.solana.com npm run request

# Event queue → position_manager (one process)
RPC_URL=https://api.devnet.solana.com npm run event

# Liquidator (one process)
RPC_URL=https://api.devnet.solana.com npm run liquidator
```

Run each in a separate terminal (or under a process manager). The authority/liquidator keypair must have SOL for transaction fees.

## Backend API

The main app backend lives in `backend/`. It serves:

- **GET /api/config** – Program ID and RPC URL.
- **GET /api/markets** – All market accounts.
- **GET /api/user/:pubkey** – User collateral and positions.
- **POST /api/relay** – Submit a signed transaction (base64).

Start it with:

```bash
cd backend && npm install && npm run build && RPC_URL=... npm start
```
