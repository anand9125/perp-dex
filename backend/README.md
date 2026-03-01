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

## IDL

Uses `idl.json` at repo root (copied from `target/idl/perp_dex.json`). Re-copy after program changes:

```bash
cp ../target/idl/perp_dex.json ./idl.json
```
