/**
 * Shared market types for perp mobile
 */
export type MarketItem = {
  symbol: string;
  name: string;
  base: string;
  quote: string;
  price: string;
  priceUsd: string;
  change24h: number;
  volume24h: string;
  leverage: string;
  high24h: string;
  low24h: string;
  volBase24h?: string;
  volQuote24h?: string;
};

export type OrderBookRow = {
  price: string;
  size: string;
  total?: number; // for depth bar
};

export type OrderBook = {
  bids: OrderBookRow[];
  asks: OrderBookRow[];
  midPrice?: string;
  bidPct?: number;
  askPct?: number;
};

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1D' | '1W';
