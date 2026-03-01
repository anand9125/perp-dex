/**
 * Fetch markets and user data from the backend API.
 */
import { getApiUrl } from './config';

const api = () => getApiUrl();

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

export async function fetchConfig(): Promise<{ programId: string; rpcUrl: string }> {
  const res = await fetch(`${api()}/api/config`);
  if (!res.ok) throw new Error('Failed to fetch config');
  return res.json();
}

export async function fetchMarkets(): Promise<ApiMarket[]> {
  const res = await fetch(`${api()}/api/markets`);
  if (!res.ok) throw new Error('Failed to fetch markets');
  const data = await res.json();
  return data.markets ?? [];
}

export async function fetchUser(pubkey: string): Promise<{
  collateral: ApiUserCollateral | null;
  positions: ApiPosition[];
}> {
  const res = await fetch(`${api()}/api/user/${encodeURIComponent(pubkey)}`);
  if (!res.ok) throw new Error('Failed to fetch user');
  return res.json();
}

export async function relayTransaction(serializedTxBase64: string): Promise<{ signature: string }> {
  const res = await fetch(`${api()}/api/relay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction: serializedTxBase64 }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Relay failed');
  }
  return res.json();
}
