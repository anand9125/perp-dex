/**
 * Shared fetch logic for REST and indexer: markets, user, queue counts, order book.
 */
import { PublicKey } from '@solana/web3.js';
const SLAB_HEADER_LEN = 32;
const NODE_SIZE = 88;
const LEAF_NODE_TAG = 2;
// LeafNode: tag(4) + fee_tier(1) + reserved(11) = 16, key(16), owner(32), quantity(8), timestamp(8)
const LEAF_KEY_OFFSET = 16;
const LEAF_QUANTITY_OFFSET = 64;
/** Parse slab account data into price levels (aggregate by price). Account layout: 8-byte discriminator + slab. */
function parseSlabToLevels(data) {
    const levels = new Map();
    const DISCRIMINATOR_LEN = 8;
    if (!data || data.length < DISCRIMINATOR_LEN + SLAB_HEADER_LEN + NODE_SIZE)
        return levels;
    const slabStart = DISCRIMINATOR_LEN;
    const nodeCount = Math.floor((data.length - slabStart - SLAB_HEADER_LEN) / NODE_SIZE);
    for (let i = 0; i < nodeCount; i++) {
        const nodeBase = slabStart + SLAB_HEADER_LEN + i * NODE_SIZE;
        const tag = data.readUInt32LE(nodeBase);
        if (tag !== LEAF_NODE_TAG)
            continue;
        const keyLo = data.readBigUInt64LE(nodeBase + LEAF_KEY_OFFSET);
        const keyHi = data.readBigUInt64LE(nodeBase + LEAF_KEY_OFFSET + 8);
        const price = Number(keyHi);
        const quantity = Number(data.readBigUInt64LE(nodeBase + LEAF_QUANTITY_OFFSET));
        if (price > 0 && quantity > 0) {
            levels.set(price, (levels.get(price) ?? 0) + quantity);
        }
    }
    return levels;
}
/** Fetch bids and asks slab accounts and return aggregated order book. */
export async function fetchOrderBook(connection, programId, symbol, bidsPda, asksPda) {
    const [bidsInfo, asksInfo] = await Promise.all([
        connection.getAccountInfo(bidsPda),
        connection.getAccountInfo(asksPda),
    ]);
    const bidLevels = bidsInfo?.data ? parseSlabToLevels(bidsInfo.data) : new Map();
    const askLevels = asksInfo?.data ? parseSlabToLevels(asksInfo.data) : new Map();
    const bids = Array.from(bidLevels.entries())
        .sort((a, b) => b[0] - a[0])
        .slice(0, 20)
        .map(([price, size]) => ({ price: String(price), size: String(size) }));
    const asks = Array.from(askLevels.entries())
        .sort((a, b) => a[0] - b[0])
        .slice(0, 20)
        .map(([price, size]) => ({ price: String(price), size: String(size) }));
    const bidVol = bids.reduce((s, r) => s + parseFloat(r.size), 0);
    const askVol = asks.reduce((s, r) => s + parseFloat(r.size), 0);
    const total = bidVol + askVol;
    const midPrice = bids.length && asks.length
        ? ((Number(bids[0].price) + Number(asks[0].price)) / 2).toFixed(4)
        : bids.length
            ? bids[0].price
            : asks.length
                ? asks[0].price
                : undefined;
    return {
        bids,
        asks,
        midPrice,
        bidPct: total > 0 ? Math.round((bidVol / total) * 10000) / 100 : undefined,
        askPct: total > 0 ? Math.round((askVol / total) * 10000) / 100 : undefined,
    };
}
const DISCRIMINATORS = {
    MarketState: Buffer.from([0, 125, 123, 215, 95, 96, 164, 194]),
    Position: Buffer.from([170, 188, 143, 228, 122, 64, 247, 208]),
};
const REQUEST_QUEUE_COUNT_OFFSET = 12;
const EVENT_QUEUE_COUNT_OFFSET = 12;
export async function fetchMarkets(connection, program) {
    const programId = program.programId;
    const discriminator = DISCRIMINATORS.MarketState;
    let accounts;
    try {
        accounts = await connection.getProgramAccounts(programId, {
            commitment: 'confirmed',
            filters: [
                { memcmp: { offset: 0, bytes: discriminator.toString('base64') } },
            ],
        });
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('Base58') || msg.includes('Invalid')) {
            const all = await connection.getProgramAccounts(programId, { commitment: 'confirmed' });
            accounts = all.filter((a) => a.account.data.length >= 8 && discriminator.equals(Buffer.from(a.account.data.subarray(0, 8))));
        }
        else {
            throw e;
        }
    }
    const coder = program.coder;
    return accounts
        .map(({ pubkey, account }) => {
        try {
            const decoded = coder.accounts.decode('marketState', account.data);
            const symbol = decoded.symbol?.replace(/\0/g, '').trim() || pubkey.toBase58().slice(0, 8);
            return {
                publicKey: pubkey.toBase58(),
                symbol,
                authority: decoded.authority?.toBase58() ?? '',
                lastOraclePrice: decoded.lastOraclePrice != null ? Number(decoded.lastOraclePrice) : 0,
                lastOracleTs: decoded.lastOracleTs != null ? Number(decoded.lastOracleTs) : 0,
                bid: decoded.bid?.toBase58() ?? '',
                asks: decoded.asks?.toBase58() ?? '',
                imBps: decoded.imBps ?? 0,
                mmBps: decoded.mmBps ?? 0,
                tickSize: decoded.tickSize ?? 0,
                stepSize: decoded.stepSize ?? 0,
                minOrderNotional: decoded.minOrderNotional != null ? Number(decoded.minOrderNotional) : 0,
            };
        }
        catch {
            return null;
        }
    })
        .filter((m) => m != null);
}
export async function fetchUser(connection, program, programId, userPubkey) {
    const pubkey = new PublicKey(userPubkey);
    const [collateralPda] = PublicKey.findProgramAddressSync([Buffer.from('user_colletral'), pubkey.toBuffer()], programId);
    const collateralAccount = await connection.getAccountInfo(collateralPda);
    let collateral = null;
    if (collateralAccount?.data) {
        try {
            const decoded = program.coder.accounts.decode('userCollateral', collateralAccount.data);
            collateral = {
                owner: decoded.owner?.toBase58() ?? '',
                collateralAmount: decoded.collateralAmount != null ? decoded.collateralAmount.toString() : '0',
                lastUpdated: decoded.lastUpdated != null ? Number(decoded.lastUpdated) : 0,
            };
        }
        catch { }
    }
    const positionsAccounts = await connection.getProgramAccounts(programId, {
        commitment: 'confirmed',
        filters: [
            { memcmp: { offset: 0, bytes: DISCRIMINATORS.Position.toString('base64') } },
            { memcmp: { offset: 8, bytes: Buffer.from(pubkey.toBytes()).toString('base64') } },
        ],
    });
    const coder = program.coder;
    const positions = positionsAccounts
        .map(({ pubkey: posPubkey, account }) => {
        try {
            const decoded = coder.accounts.decode('position', account.data);
            return {
                publicKey: posPubkey.toBase58(),
                owner: decoded.owner?.toBase58() ?? '',
                market: decoded.market?.toBase58() ?? '',
                side: decoded.side,
                basePosition: decoded.basePosition != null ? Number(decoded.basePosition) : 0,
                entryPrice: decoded.entryPrice != null ? Number(decoded.entryPrice) : 0,
                realizedPnl: decoded.realizedPnl != null ? Number(decoded.realizedPnl) : 0,
                qty: decoded.qty != null ? Number(decoded.qty) : 0,
                status: decoded.status,
            };
        }
        catch {
            return null;
        }
    })
        .filter((p) => p != null);
    return { collateral, positions };
}
export async function getRequestQueueCount(connection, programId) {
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from('request_queue')], programId);
    const info = await connection.getAccountInfo(pda);
    if (!info?.data || info.data.length < REQUEST_QUEUE_COUNT_OFFSET + 2)
        return 0;
    return info.data.readUInt16LE(REQUEST_QUEUE_COUNT_OFFSET);
}
export async function getEventQueueCount(connection, programId) {
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from('event_queue')], programId);
    const info = await connection.getAccountInfo(pda);
    if (!info?.data || info.data.length < EVENT_QUEUE_COUNT_OFFSET + 2)
        return 0;
    return info.data.readUInt16LE(EVENT_QUEUE_COUNT_OFFSET);
}
