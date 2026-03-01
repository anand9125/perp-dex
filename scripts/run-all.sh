#!/usr/bin/env bash
# Run backend + all 3 crankers. Uses RPC_URL from env or devnet. Ctrl+C stops everything.
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
RPC_URL="${RPC_URL:-https://api.devnet.solana.com}"
export RPC_URL

if [ ! -f "target/idl/perp_dex.json" ]; then
  echo "Missing target/idl/perp_dex.json. Run: anchor build"
  exit 1
fi
if [ ! -f "backend/idl.json" ]; then
  echo "Copying IDL to backend..."
  cp target/idl/perp_dex.json backend/idl.json
fi

echo "=== Perp DEX: building backend ==="
(cd backend && npm install --silent && npm run build)
echo "=== Perp DEX: building crankers ==="
(cd crankers && npm install --silent && npm run build)

echo "=== Starting backend (port 3001) ==="
(cd backend && node dist/index.js) &
BACKEND_PID=$!

sleep 2
echo "=== Starting crankers ==="
(cd crankers && node dist/request-cranker.js) &
CR1=$!
(cd crankers && node dist/event-cranker.js) &
CR2=$!
(cd crankers && node dist/liquidator.js) &
CR3=$!

cleanup() {
  echo "Stopping..."
  kill $BACKEND_PID 2>/dev/null || true
  kill $CR1 $CR2 $CR3 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM

echo ""
echo "Backend: http://localhost:3001  WS: ws://localhost:3001/ws"
echo "Crankers: request + event + liquidator running. Ctrl+C to stop all."
wait $BACKEND_PID
