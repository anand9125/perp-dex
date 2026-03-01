/**
 * Program ID and RPC config. Point to your backend or a public RPC.
 */
const DEFAULT_RPC = 'https://api.devnet.solana.com';
const DEFAULT_API_URL = 'http://localhost:3001';

export const PROGRAM_ID = '81dJfLhAbLPYQKbEHskyLvQdzbQffJzG9tVVfFRhpZ6p';

export function getRpcUrl(): string {
  if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_RPC_URL) {
    return process.env.EXPO_PUBLIC_RPC_URL;
  }
  if (typeof process !== 'undefined' && process.env?.REACT_APP_RPC_URL) {
    return process.env.REACT_APP_RPC_URL;
  }
  return DEFAULT_RPC;
}

export function getApiUrl(): string {
  if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  if (typeof process !== 'undefined' && process.env?.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  return DEFAULT_API_URL;
}

/** WebSocket URL for real-time indexer (same host as API, path /ws) */
export function getWsUrl(): string {
  if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_WS_URL) {
    return process.env.EXPO_PUBLIC_WS_URL;
  }
  if (typeof process !== 'undefined' && process.env?.REACT_APP_WS_URL) {
    return process.env.REACT_APP_WS_URL;
  }
  const api = getApiUrl();
  if (api.startsWith('https://')) return api.replace('https://', 'wss://') + '/ws';
  if (api.startsWith('http://')) return api.replace('http://', 'ws://') + '/ws';
  return 'ws://localhost:3001/ws';
}
