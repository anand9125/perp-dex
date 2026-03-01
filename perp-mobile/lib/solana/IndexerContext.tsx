/**
 * WebSocket indexer context: connects to backend /ws, subscribes to wallet user, exposes live state.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { getWsUrl } from './config';

export type ApiMarket = {
  publicKey: string;
  symbol: string;
  authority: string;
  lastOraclePrice: number;
  lastOracleTs: number;
  bid: string;
  asks: string;
  imBps: number;
  mmBps: number;
  tickSize: number;
  stepSize: number;
  minOrderNotional: number;
};

export type ApiUserCollateral = {
  owner: string;
  collateralAmount: string;
  lastUpdated: number;
};

export type ApiPosition = {
  publicKey: string;
  owner: string;
  market: string;
  side: { buy?: {}; sell?: {} };
  basePosition: number;
  entryPrice: number;
  realizedPnl: number;
  qty: number;
  status: unknown;
};

export type OrderBookRow = { price: string; size: string };
export type ApiOrderBook = {
  bids: OrderBookRow[];
  asks: OrderBookRow[];
  midPrice?: string;
  bidPct?: number;
  askPct?: number;
};

export type IndexerState = {
  markets: ApiMarket[];
  requestQueueCount: number;
  eventQueueCount: number;
  users: Record<string, { collateral: ApiUserCollateral | null; positions: ApiPosition[] }>;
  orderBooks: Record<string, ApiOrderBook>;
};

type IndexerContextValue = {
  state: IndexerState | null;
  connected: boolean;
  subscribeUser: (pubkey: PublicKey | null) => void;
};

const defaultState: IndexerState = {
  markets: [],
  requestQueueCount: 0,
  eventQueueCount: 0,
  users: {},
  orderBooks: {},
};

const IndexerContext = createContext<IndexerContextValue>({
  state: null,
  connected: false,
  subscribeUser: () => {},
});

export function IndexerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<IndexerState | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const subscribePubkeyRef = useRef<string | null>(null);

  const subscribeUser = useCallback((pubkey: PublicKey | null) => {
    const str = pubkey?.toBase58() ?? null;
    subscribePubkeyRef.current = str;
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      if (str) ws.send(JSON.stringify({ type: 'subscribe_user', pubkey: str }));
    }
  }, []);

  useEffect(() => {
    const url = getWsUrl();
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        const pk = subscribePubkeyRef.current;
        if (pk) ws.send(JSON.stringify({ type: 'subscribe_user', pubkey: pk }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.type === 'state' && msg.payload) {
            setState(msg.payload as IndexerState);
          }
        } catch {}
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = () => {};
    };

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      const ws = wsRef.current;
      ws?.close();
      wsRef.current = null;
    };
  }, []);

  const value: IndexerContextValue = {
    state: state ?? defaultState,
    connected,
    subscribeUser,
  };

  return (
    <IndexerContext.Provider value={value}>
      {children}
    </IndexerContext.Provider>
  );
}

export function useIndexer() {
  return useContext(IndexerContext);
}

/** Live markets from indexer; falls back to empty if not connected */
export function useIndexerMarkets(): ApiMarket[] {
  const { state } = useIndexer();
  return state?.markets ?? [];
}

/** Live user data for a pubkey (collateral + positions) from indexer */
export function useIndexerUser(pubkey: PublicKey | null): {
  collateral: ApiUserCollateral | null;
  positions: ApiPosition[];
} {
  const { state, subscribeUser } = useIndexer();
  useEffect(() => {
    subscribeUser(pubkey);
  }, [pubkey?.toBase58(), subscribeUser]);
  if (!pubkey || !state?.users) {
    return { collateral: null, positions: [] };
  }
  const u = state.users[pubkey.toBase58()];
  if (!u) return { collateral: null, positions: [] };
  return { collateral: u.collateral, positions: u.positions };
}

/** Queue counts for "pending" UX */
export function useIndexerQueues(): { requestQueueCount: number; eventQueueCount: number } {
  const { state } = useIndexer();
  return {
    requestQueueCount: state?.requestQueueCount ?? 0,
    eventQueueCount: state?.eventQueueCount ?? 0,
  };
}
