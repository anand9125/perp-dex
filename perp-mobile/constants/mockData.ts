import type { MarketItem, OrderBook, OrderBookRow } from '@/types/market';

export const MOCK_MARKETS: MarketItem[] = [
  { symbol: 'SOL-PERP', name: 'Solana Perpetual', base: 'SOL', quote: 'USDT', price: '245.32', priceUsd: '$245.32', change24h: 2.45, volume24h: '12.5M', leverage: '10x', high24h: '248.10', low24h: '238.50', volBase24h: '51.2K', volQuote24h: '12.5M' },
  { symbol: 'BTC-PERP', name: 'Bitcoin Perpetual', base: 'BTC', quote: 'USDT', price: '97234.10', priceUsd: '$97,234.10', change24h: -0.82, volume24h: '891.2M', leverage: '10x', high24h: '98100', low24h: '96500', volBase24h: '9.2K', volQuote24h: '891.2M' },
  { symbol: 'ETH-PERP', name: 'Ethereum Perpetual', base: 'ETH', quote: 'USDT', price: '3421.55', priceUsd: '$3,421.55', change24h: 1.12, volume24h: '451.1M', leverage: '10x', high24h: '3460', low24h: '3380', volBase24h: '132.1K', volQuote24h: '451.1M' },
  { symbol: 'XRP-PERP', name: 'XRP Perpetual', base: 'XRP', quote: 'USDT', price: '1.3761', priceUsd: '$1.38', change24h: 6.49, volume24h: '299.91M', leverage: '5x', high24h: '1.4333', low24h: '1.2881', volBase24h: '219.42M', volQuote24h: '299.91M' },
  { symbol: 'DOGE-PERP', name: 'Dogecoin Perpetual', base: 'DOGE', quote: 'USDT', price: '0.3821', priceUsd: '$0.38', change24h: 4.21, volume24h: '88.2M', leverage: '10x', high24h: '0.3950', low24h: '0.3650', volBase24h: '231M', volQuote24h: '88.2M' },
  { symbol: 'BNB-PERP', name: 'BNB Perpetual', base: 'BNB', quote: 'USDT', price: '612.40', priceUsd: '$612.40', change24h: -1.05, volume24h: '112.3M', leverage: '10x', high24h: '618.00', low24h: '608.00', volBase24h: '183.5K', volQuote24h: '112.3M' },
];

export function getMarketBySymbol(symbol: string): MarketItem | undefined {
  return MOCK_MARKETS.find((m) => m.symbol === symbol) ?? MOCK_MARKETS[0];
}

export function mockOrderBook(symbol: string, midPrice: number): OrderBook {
  const step = symbol.startsWith('BTC') ? 1 : symbol.startsWith('ETH') ? 0.1 : 0.01;
  const bids: OrderBookRow[] = [];
  const asks: OrderBookRow[] = [];
  for (let i = 0; i < 12; i++) {
    const bp = (midPrice - (i + 1) * step).toFixed(4);
    const ap = (midPrice + (i + 1) * step).toFixed(4);
    const bSize = (Math.random() * 50 + 5).toFixed(1);
    const aSize = (Math.random() * 50 + 5).toFixed(1);
    bids.push({ price: bp, size: bSize });
    asks.unshift({ price: ap, size: aSize });
  }
  const bidVol = bids.reduce((s, r) => s + parseFloat(r.size), 0);
  const askVol = asks.reduce((s, r) => s + parseFloat(r.size), 0);
  const total = bidVol + askVol;
  return {
    bids,
    asks,
    midPrice: midPrice.toFixed(4),
    bidPct: Math.round((bidVol / total) * 10000) / 100,
    askPct: Math.round((askVol / total) * 10000) / 100,
  };
}

