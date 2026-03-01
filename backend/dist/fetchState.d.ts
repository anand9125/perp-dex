/**
 * Shared fetch logic for REST and indexer: markets, user, queue counts, order book.
 */
import { Connection, PublicKey } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';
import type { Idl } from '@coral-xyz/anchor';
export type OrderBookRow = {
    price: string;
    size: string;
};
export type ApiOrderBook = {
    bids: OrderBookRow[];
    asks: OrderBookRow[];
    midPrice?: string;
    bidPct?: number;
    askPct?: number;
};
/** Fetch bids and asks slab accounts and return aggregated order book. */
export declare function fetchOrderBook(connection: Connection, programId: PublicKey, symbol: string, bidsPda: PublicKey, asksPda: PublicKey): Promise<ApiOrderBook>;
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
    side: unknown;
    basePosition: number;
    entryPrice: number;
    realizedPnl: number;
    qty: number;
    status: unknown;
};
export declare function fetchMarkets(connection: Connection, program: Program<Idl>): Promise<ApiMarket[]>;
export declare function fetchUser(connection: Connection, program: Program<Idl>, programId: PublicKey, userPubkey: string): Promise<{
    collateral: ApiUserCollateral | null;
    positions: ApiPosition[];
}>;
export declare function getRequestQueueCount(connection: Connection, programId: PublicKey): Promise<number>;
export declare function getEventQueueCount(connection: Connection, programId: PublicKey): Promise<number>;
