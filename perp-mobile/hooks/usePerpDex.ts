/**
 * Hooks to fetch chain data via the backend and build/send transactions.
 */
import { useCallback, useEffect, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { BN } from 'bn.js';
import * as api from '../lib/solana/api';
import type { ApiMarket, ApiUserCollateral, ApiPosition } from '../lib/solana/api';
import { getConnection, getProgram } from '../lib/solana/program';
import {
  getMarketPda,
  getUserCollateralPda,
  getPositionPda,
  getRequestQueuePda,
  getGlobalConfigPda,
} from '../lib/solana/pdas';
import { useWallet } from '../lib/solana/WalletContext';

export function useApiMarkets(): {
  markets: ApiMarket[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [markets, setMarkets] = useState<ApiMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.fetchMarkets();
      setMarkets(list);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to fetch markets');
      setMarkets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { markets, loading, error, refetch };
}

export function useApiUser(pubkey: PublicKey | null): {
  collateral: ApiUserCollateral | null;
  positions: ApiPosition[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [collateral, setCollateral] = useState<ApiUserCollateral | null>(null);
  const [positions, setPositions] = useState<ApiPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!pubkey) {
      setCollateral(null);
      setPositions([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.fetchUser(pubkey.toBase58());
      setCollateral(data.collateral);
      setPositions(data.positions ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to fetch user');
      setCollateral(null);
      setPositions([]);
    } finally {
      setLoading(false);
    }
  }, [pubkey?.toBase58()]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { collateral, positions, loading, error, refetch };
}

export type PlaceOrderParams = {
  user: PublicKey;
  marketSymbol: string;
  side: 'buy' | 'sell';
  qty: number;
  limitPrice: number;
  initialMargin?: number;
  leverage?: number;
  orderId?: number;
};

export function usePlaceOrder(): {
  placeOrder: (params: PlaceOrderParams) => Promise<string>;
  loading: boolean;
  error: string | null;
} {
  const { signTransaction } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const placeOrder = useCallback(async (params: PlaceOrderParams): Promise<string> => {
    if (!signTransaction) {
      const err = new Error('Connect a wallet that can sign transactions to place orders.');
      setError(err.message);
      throw err;
    }
    setLoading(true);
    setError(null);
    try {
      const program = getProgram();
      const connection = getConnection();
      const {
        user,
        marketSymbol,
        side,
        qty,
        limitPrice,
        initialMargin = 10,
        leverage = 10,
        orderId = Date.now() % 0xffffffff,
      } = params;

      const [marketPda] = getMarketPda(marketSymbol);
      const [userCollateralPda] = getUserCollateralPda(user);
      const [positionPda] = getPositionPda(marketSymbol, user);
      const [requestQueuePda] = getRequestQueuePda();
      const [globalConfigPda] = getGlobalConfigPda();

      const order = {
        user: Array.from(user.toBytes()),
        orderId: new BN(orderId),
        side: side === 'buy' ? { buy: {} } : { sell: {} },
        qty: new BN(qty),
        orderType: { limit: {} },
        limitPrice: new BN(limitPrice),
        initialMargin: new BN(initialMargin),
        leverage,
        market: marketPda,
      };

      const tx = await program.methods
        .placeOrder(order)
        .accounts({
          user,
          globalConfig: globalConfigPda,
          market: marketPda,
          userColletral: userCollateralPda,
          positionPerMarket: positionPda,
          requestQueue: requestQueuePda,
          systemProgram: new PublicKey('11111111111111111111111111111111'),
          associatedTokenProgram: new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
          tokenProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        } as any)
        .transaction();

      const signed = await signTransaction(tx);
      const serialized = signed.serialize();
      const base64 = Buffer.from(serialized).toString('base64');

      try {
        const { signature } = await api.relayTransaction(base64);
        return signature;
      } catch {
        const sig = await connection.sendRawTransaction(serialized, { skipPreflight: false });
        return sig;
      }
    } catch (e: any) {
      setError(e?.message ?? 'Place order failed');
      throw e;
    } finally {
      setLoading(false);
    }
  }, [signTransaction]);

  return { placeOrder, loading, error };
}
