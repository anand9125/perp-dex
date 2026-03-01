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
