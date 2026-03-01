# Perp DEX Backend

Node API that reads from the perp-dex Solana program and exposes markets, user collateral, and positions. Optional relay for signed transactions.

## Setup

```bash
cd backend
npm install
npm run build
```

## Config

- **RPC_URL** – Solana RPC (default: `https://api.devnet.solana.com`)
- **PORT** – API port (default: `3001`)
- **INDEXER_POLL_MS** – Indexer poll interval in ms (default: `2500`)

## Run

```bash
RPC_URL=https://api.devnet.solana.com npm start
```

Or with a local validator:

```bash
RPC_URL=http://127.0.0.1:8899 npm start
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/config` | `{ programId, rpcUrl }` |
| GET | `/api/markets` | List all `MarketState` accounts |
| GET | `/api/user/:pubkey` | User collateral + positions |
| POST | `/api/relay` | Body: `{ "transaction": "<base64 signed tx>" }` |

## WebSocket indexer (`/ws`)

Real-time state for the mobile app. Connect to `ws://localhost:3001/ws` (or `wss://` when using HTTPS).

- **Server → client:** `{ "type": "state", "payload": { markets, requestQueueCount, eventQueueCount, users } }`  
  Sent on connect and whenever chain state changes (polled every `INDEXER_POLL_MS`).
- **Client → server:** `{ "type": "subscribe_user", "pubkey": "<base58>" }`  
  Subscribes a wallet so its collateral and positions are included in `payload.users` on each update.

The mobile app uses this to show live markets, balance, positions, and queue status (e.g. “Processing orders…”).

## IDL

Uses `idl.json` at repo root (copied from `target/idl/perp_dex.json`). Re-copy after program changes:

```bash
cp ../target/idl/perp_dex.json ./idl.json
```
