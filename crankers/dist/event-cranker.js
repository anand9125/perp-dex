/**
 * Event-queue cranker: when event_queue.count > 0, peeks head user and calls position_manager(user) per market until one consumes the event.
 * Run: RPC_URL=... CRANKER_AUTHORITY_KEYPAIR=... [MARKET_SYMBOLS=SOL-PERP,BTC-PERP] node dist/event-cranker.js
 */
import { SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { connection, getEventQueueCount, eventQueuePda, peekEventQueueHeadUser, getAuthorityKeypair, marketPda, positionPdaFromSymbol, userCollateralPda, getAllMarkets, idl, } from './shared.js';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
const POLL_MS = Number(process.env.CRANK_POLL_MS) || 2000;
const MARKET_SYMBOLS_ENV = process.env.MARKET_SYMBOLS;
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
        console.log('No markets configured.');
    }
    console.log('Event cranker started. Markets:', markets.map((m) => m.symbol).join(', ') || '(none)');
    for (;;) {
        try {
            const count = await getEventQueueCount();
            if (count === 0) {
                await sleep(POLL_MS);
                continue;
            }
            const eqInfo = await connection.getAccountInfo(eventQueuePda);
            if (!eqInfo?.data) {
                await sleep(POLL_MS);
                continue;
            }
            const userAtHead = peekEventQueueHeadUser(eqInfo.data);
            if (!userAtHead) {
                await sleep(POLL_MS);
                continue;
            }
            const userColletral = userCollateralPda(userAtHead);
            let consumed = false;
            for (const { symbol } of markets) {
                const market = marketPda(symbol);
                const userPosition = positionPdaFromSymbol(symbol, userAtHead);
                try {
                    await programWithWallet.methods
                        .positionManager(userAtHead)
                        .accounts({
                        market,
                        userPosition,
                        eventQueue: eventQueuePda,
                        userColletral,
                        systemProgram: SystemProgram.programId,
                        tokenProgram: TOKEN_PROGRAM_ID,
                    })
                        .rpc();
                    console.log(`Position manager applied for user ${userAtHead.toBase58().slice(0, 8)}... market ${symbol}`);
                    consumed = true;
                    break;
                }
                catch (e) {
                    if (e.message?.includes('EventNotForUser') || e.logs?.some((l) => l.includes('EventNotForUser'))) {
                        continue;
                    }
                    console.error(`position_manager ${symbol}:`, e.message || e);
                }
            }
            if (!consumed) {
                await sleep(500);
            }
        }
        catch (e) {
            console.error('Event crank loop error:', e.message || e);
        }
        await sleep(POLL_MS);
    }
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
main();
