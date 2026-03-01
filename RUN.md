# Run the full Perp DEX stack

You’ve already deployed the program. Follow these steps to run backend, crankers, and mobile app.

---

## 1. Environment

Set your RPC and (for crankers) wallet. Examples:

**Devnet (default):**
```bash
export RPC_URL="https://api.devnet.solana.com"
```

**Local validator:**
```bash
export RPC_URL="http://127.0.0.1:8899"
```

**Crankers & liquidator** need a funded keypair (for tx fees and liquidator rewards):
- `CRANKER_AUTHORITY_KEYPAIR` – JSON array of secret key bytes, or leave unset to use `~/.config/solana/id.json`
- `LIQUIDATOR_KEYPAIR` – same; can be the same keypair as authority
- Ensure the keypair has SOL (e.g. `solana airdrop 2` on devnet).

---

## 2. IDL (one-time)

Backend and crankers need the IDL. If you haven’t already:

```bash
# From repo root
cp target/idl/perp_dex.json backend/idl.json
```

If `target/idl/perp_dex.json` is missing, run `anchor build` first.

---

## 3. Backend (API + WebSocket indexer)

One terminal:

```bash
cd backend
npm install
npm run build
RPC_URL="${RPC_URL:-https://api.devnet.solana.com}" PORT=3001 npm start
```

Leave this running. You should see:
- `Perp DEX API http://localhost:3001`
- `WebSocket indexer ws://localhost:3001/ws`

---

## 4. Crankers (3 processes)

Open **3 more terminals**. In each, from repo root:

**Terminal A – Request queue cranker**
```bash
cd crankers
npm install
npm run build
RPC_URL="${RPC_URL:-https://api.devnet.solana.com}" npm run request
```

**Terminal B – Event queue cranker**
```bash
cd crankers
# (install/build once is enough)
RPC_URL="${RPC_URL:-https://api.devnet.solana.com}" npm run event
```

**Terminal C – Liquidator**
```bash
cd crankers
RPC_URL="${RPC_URL:-https://api.devnet.solana.com}" npm run liquidator
```

Optional: set `MARKET_SYMBOLS=SOL-PERP,BTC-PERP` (or your market symbols) for request/event crankers. If unset, they use all markets from chain.

---

## 5. Mobile app

From repo root:

```bash
cd perp-mobile
npm install
```

**Point the app at your backend:**

- **Android emulator:** backend on host = `10.0.2.2:3001`
- **iOS simulator:** backend on host = `localhost:3001`
- **Physical device:** use your machine’s LAN IP (e.g. `192.168.1.5:3001`)

Example (physical device, replace with your IP):

```bash
EXPO_PUBLIC_API_URL="http://192.168.1.5:3001" npx expo start
```

Or create `.env` in `perp-mobile/`:

```
EXPO_PUBLIC_API_URL=http://YOUR_IP:3001
```

Then:

```bash
npx expo start
```

Press `a` for Android or `i` for iOS. The app will use the backend for API and WebSocket (`/ws` is derived from the same host).

---

## 6. Quick “run everything” (backend + crankers)

From repo root, after `cd backend && npm install && npm run build` and `cd crankers && npm install && npm run build`:

```bash
./scripts/run-all.sh
```

This starts the backend in the foreground and the three crankers in the background. Stop with Ctrl+C (stops backend); crankers keep running until you kill them or close the terminal. See script for details.

---

## Summary

| Component        | Command / URL |
|-----------------|---------------|
| Backend         | `cd backend && npm run build && RPC_URL=... npm start` → http://localhost:3001 |
| WS indexer      | Same process, path `/ws` → ws://localhost:3001/ws |
| Request cranker | `cd crankers && npm run request` |
| Event cranker   | `cd crankers && npm run event` |
| Liquidator      | `cd crankers && npm run liquidator` |
| Mobile          | `cd perp-mobile && EXPO_PUBLIC_API_URL=http://HOST:3001 npx expo start` |

Use the same `RPC_URL` (and cluster) everywhere as your deployed program.
