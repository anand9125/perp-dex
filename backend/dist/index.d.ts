import { type ApiMarket, type ApiUserCollateral, type ApiPosition, type ApiOrderBook } from './fetchState.js';
export type IndexerState = {
    markets: ApiMarket[];
    requestQueueCount: number;
    eventQueueCount: number;
    users: Record<string, {
        collateral: ApiUserCollateral | null;
        positions: ApiPosition[];
    }>;
    orderBooks: Record<string, ApiOrderBook>;
};
