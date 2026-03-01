/**
 * Request-queue cranker: when request_queue.count > 0, calls process_place_order for each market.
 * Run: RPC_URL=... CRANKER_AUTHORITY_KEYPAIR=... [MARKET_SYMBOLS=SOL-PERP,BTC-PERP] node dist/request-cranker.js
 */
import { SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { connection, getRequestQueueCount, requestQueuePda, eventQueuePda, getAuthorityKeypair, marketPda, bidsPda, asksPda, getAllMarkets, idl, } from './shared.js';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
const POLL_MS = Number(process.env.CRANK_POLL_MS) || 2000;
const MARKET_SYMBOLS_ENV = process.env.MARKET_SYMBOLS; // optional comma-separated; if not set we fetch all markets
async function main() {
    const authority = getAuthorityKeypair();
    const provider = new AnchorProvider(connection, { publicKey: authority.publicKey, signTransaction: async (tx) => { tx.partialSign(authority); return tx; } }, { commitment: 'confirmed' });
    const programWithWallet = new Program(idl, provider);
    let markets;
    if (MARKET_SYMBOLS_ENV) {
        markets = MARKET_SYMBOLS_ENV.split(',').map((s) => ({ symbol: s.trim() }));
    }
    else {
        const list = await getAllMarkets();
        markets = list.map((m) => ({ symbol: m.symbol }));
    }
    if (markets.length === 0) {
        console.log('No markets configured. Set MARKET_SYMBOLS or ensure program has markets.');
    }
    console.log('Request cranker started. Markets:', markets.map((m) => m.symbol).join(', ') || '(none)');
    for (;;) {
        try {
            const count = await getRequestQueueCount();
            if (count === 0) {
                await sleep(POLL_MS);
                continue;
            }
            for (const { symbol } of markets) {
                const market = marketPda(symbol);
                const bids = bidsPda(symbol);
                const asks = asksPda(symbol);
                try {
                    await programWithWallet.methods
                        .processPlaceOrder()
                        .accounts({
                        authority: authority.publicKey,
                        market,
                        bids,
                        asks,
                        requestQueue: requestQueuePda,
                        eventQueue: eventQueuePda,
                        systemProgram: SystemProgram.programId,
                        tokenProgram: TOKEN_PROGRAM_ID,
                    })
                        .rpc();
                    console.log(`Processed request queue for market ${symbol}`);
                }
                catch (e) {
                    if (e.message?.includes('QueueEmpty') || e.logs?.some((l) => l.includes('QueueEmpty'))) {
                        break;
                    }
                    console.error(`process_place_order ${symbol}:`, e.message || e);
                }
                const remaining = await getRequestQueueCount();
                if (remaining === 0)
                    break;
            }
        }
        catch (e) {
            console.error('Crank loop error:', e.message || e);
        }
        await sleep(POLL_MS);
    }
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
main();
