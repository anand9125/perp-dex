/**
 * Perp DEX Backend – REST API + WebSocket indexer for real-time UI state.
 * Run: RPC_URL=https://api.devnet.solana.com node dist/index.js
 */
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { createRequire } from 'module';
import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, Idl } from '@coral-xyz/anchor';
import {
  fetchMarkets,
  fetchUser,
  fetchOrderBook,
  getRequestQueueCount,
  getEventQueueCount,
  type ApiMarket,
  type ApiUserCollateral,
  type ApiPosition,
  type ApiOrderBook,
} from './fetchState.js';

const require = createRequire(import.meta.url);
const idl = require('../idl.json');

const PROGRAM_ID = new PublicKey(idl.address);
const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com';
const PORT = Number(process.env.PORT) || 3001;
const INDEXER_POLL_MS = Number(process.env.INDEXER_POLL_MS) || 10000;

const connection = new Connection(RPC_URL);
const provider = new AnchorProvider(connection, {} as any, { commitment: 'confirmed' });
const program = new Program(idl as Idl, provider);

const app = express();
app.use(cors());
app.use(express.json());

/** GET /api/config */
app.get('/api/config', (_req, res) => {
  res.json({
    programId: PROGRAM_ID.toBase58(),
    rpcUrl: RPC_URL,
  });
});

/** GET /api/markets */
app.get('/api/markets', async (_req, res) => {
  try {
    const markets = await fetchMarkets(connection, program);
    res.json({ markets });
  } catch (e: any) {
    console.error('GET /api/markets', e);
    res.status(500).json({ error: e?.message || 'Failed to fetch markets' });
  }
});

/** GET /api/user/:pubkey */
app.get('/api/user/:pubkey', async (req, res) => {
  const userPubkey = req.params.pubkey;
  if (!userPubkey) {
    return res.status(400).json({ error: 'Missing pubkey' });
  }
  try {
    const { collateral, positions } = await fetchUser(
      connection,
      program,
      PROGRAM_ID,
      userPubkey
    );
    res.json({ collateral, positions });
  } catch (e: any) {
    console.error('GET /api/user/:pubkey', e);
    res.status(500).json({ error: e?.message || 'Failed to fetch user' });
  }
});

/** GET /api/orderbook/:symbol – live order book for a market */
app.get('/api/orderbook/:symbol', async (req, res) => {
  const symbol = req.params.symbol;
  if (!symbol) return res.status(400).json({ error: 'Missing symbol' });
  try {
    const markets = await fetchMarkets(connection, program);
    const market = markets.find((m) => m.symbol === symbol);
    if (!market?.bid || !market?.asks) {
      return res.status(404).json({ error: 'Market or order book not found' });
    }
    const orderBook = await fetchOrderBook(
      connection,
      PROGRAM_ID,
      symbol,
      new PublicKey(market.bid),
      new PublicKey(market.asks)
    );
    res.json(orderBook);
  } catch (e: any) {
    console.error('GET /api/orderbook/:symbol', e);
    res.status(500).json({ error: e?.message || 'Failed to fetch order book' });
  }
});

/** POST /api/relay */
app.post('/api/relay', async (req, res) => {
  const { transaction: txBase64 } = req.body;
  if (!txBase64 || typeof txBase64 !== 'string') {
    return res.status(400).json({ error: 'Missing transaction (base64)' });
  }
  try {
    const raw = Buffer.from(txBase64, 'base64');
    const sig = await connection.sendRawTransaction(raw, { skipPreflight: false });
    res.json({ signature: sig });
  } catch (e: any) {
    console.error('POST /api/relay', e);
    res.status(500).json({ error: e?.message || 'Relay failed' });
  }
});

// --- WebSocket indexer ---
export type IndexerState = {
  markets: ApiMarket[];
  requestQueueCount: number;
  eventQueueCount: number;
  users: Record<string, { collateral: ApiUserCollateral | null; positions: ApiPosition[] }>;
  orderBooks: Record<string, ApiOrderBook>;
};

const subscribedPubkeys = new Set<string>();
let lastState: IndexerState = {
  markets: [],
  requestQueueCount: 0,
  eventQueueCount: 0,
  users: {},
  orderBooks: {},
};
let last429Log = 0;

function stateKey(s: IndexerState): string {
  return JSON.stringify({
    requestQueueCount: s.requestQueueCount,
    eventQueueCount: s.eventQueueCount,
    marketsLen: s.markets.length,
    markets: s.markets.map((m) => m.symbol + m.lastOraclePrice),
    users: Object.keys(s.users).sort().map((pk) => pk + JSON.stringify(s.users[pk])),
    orderBooks: Object.keys(s.orderBooks).sort().map((sym) => sym + JSON.stringify(s.orderBooks[sym])),
  });
}

async function tick(): Promise<boolean> {
  try {
    const [markets, requestQueueCount, eventQueueCount] = await Promise.all([
      fetchMarkets(connection, program),
      getRequestQueueCount(connection, PROGRAM_ID),
      getEventQueueCount(connection, PROGRAM_ID),
    ]);
    const orderBooks: Record<string, ApiOrderBook> = {};
    await Promise.all(
      markets.map(async (m) => {
        if (m.bid && m.asks) {
          const book = await fetchOrderBook(
            connection,
            PROGRAM_ID,
            m.symbol,
            new PublicKey(m.bid),
            new PublicKey(m.asks)
          );
          orderBooks[m.symbol] = book;
        }
      })
    );
    const users: IndexerState['users'] = {};
    const toFetch = Array.from(subscribedPubkeys).slice(0, 50);
    await Promise.all(
      toFetch.map(async (pubkey) => {
        const { collateral, positions } = await fetchUser(
          connection,
          program,
          PROGRAM_ID,
          pubkey
        );
        users[pubkey] = { collateral, positions };
      })
    );
    const next: IndexerState = {
      markets,
      requestQueueCount,
      eventQueueCount,
      users,
      orderBooks,
    };
    if (stateKey(next) !== stateKey(lastState)) {
      lastState = next;
      const payload = JSON.stringify({ type: 'state', payload: next });
      wss.clients.forEach((client) => {
        if (client.readyState === 1) client.send(payload);
      });
    }
    return false;
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    if (msg.includes('429') || msg.includes('Too Many Requests')) {
      if (Date.now() - last429Log > 60_000) {
        console.warn('Indexer: RPC rate limit (429). Increase INDEXER_POLL_MS or use a dedicated RPC.');
        last429Log = Date.now();
      }
      return true; // signal backoff
    } else {
      console.error('Indexer tick:', msg);
      return false;
    }
  }
  return false;
}

function scheduleNext(backoff: boolean): void {
  const delay = backoff ? Math.min(INDEXER_POLL_MS * 2, 60_000) : INDEXER_POLL_MS;
  setTimeout(() => {
    tick().then(scheduleNext);
  }, delay);
}

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'state', payload: lastState }));
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'subscribe_user' && typeof msg.pubkey === 'string') {
        subscribedPubkeys.add(msg.pubkey);
      }
      if (msg.type === 'unsubscribe_user' && typeof msg.pubkey === 'string') {
        subscribedPubkeys.delete(msg.pubkey);
      }
    } catch {}
  });
});

scheduleNext(false);

httpServer.listen(PORT, () => {
  console.log(`Perp DEX API http://localhost:${PORT} (RPC: ${RPC_URL})`);
  console.log(`WebSocket indexer ws://localhost:${PORT}/ws (poll ${INDEXER_POLL_MS}ms)`);
});
