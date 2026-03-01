/**
 * Liquidator: fetches all positions with base_position != 0, computes health (collateral + unrealized_pnl - maintenance_margin).
 * If health < 0, calls liquidate instruction.
 * Run: RPC_URL=... LIQUIDATOR_KEYPAIR=... node dist/liquidator.js
 */
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import {
  connection,
  program,
  getLiquidatorKeypair,
  globalConfigPda,
  eventQueuePda,
  marketPda,
  bidsPda,
  asksPda,
  positionPdaFromSymbol,
  userCollateralPda,
  getAllMarkets,
  PROGRAM_ID,
  idl,
} from './shared.js';
import { AnchorProvider, Program } from '@coral-xyz/anchor';

const POLL_MS = Number(process.env.LIQUIDATOR_POLL_MS) || 5000;
const POSITION_DISCRIMINATOR = Buffer.from([170, 188, 143, 228, 122, 64, 247, 208]);

/** Mirror RiskEngine::account_health_single: collateral + unrealized_pnl - maintenance_margin */
function accountHealthSingle(
  collateral: bigint,
  basePosition: number,
  entryPrice: number,
  markPrice: number,
  mmBps: number
): bigint {
  const qty = BigInt(basePosition);
  const entry = BigInt(entryPrice);
  const mark = BigInt(markPrice);
  if (qty === BigInt(0)) return collateral;
  const diff = mark - entry;
  const unrealizedPnl = diff * qty;
  const notional = (qty < BigInt(0) ? -qty : qty) * mark;
  const maintenanceMargin = (notional * BigInt(mmBps)) / BigInt(10_000);
  return collateral + unrealizedPnl - maintenanceMargin;
}

async function main() {
  const liquidatorKp = getLiquidatorKeypair();
  const provider = new AnchorProvider(
    connection,
    {
      publicKey: liquidatorKp.publicKey,
      signTransaction: async (tx: Transaction) => {
        tx.partialSign(liquidatorKp);
        return tx;
      },
    } as any,
    { commitment: 'confirmed' }
  );
  const programWithWallet = new Program(idl, provider);
  const coder = program.coder as any;

  const configAccount = await connection.getAccountInfo(globalConfigPda);
  if (!configAccount?.data) {
    console.error('Global config not found.');
    process.exit(1);
  }
  const globalConfig = coder.accounts.decode('globalConfig', configAccount.data);
  const vaultQuote = globalConfig.vaultQuote as PublicKey;
  const insuranceFund = globalConfig.insuranceFund as PublicKey;
  const vaultAcc = await connection.getAccountInfo(vaultQuote);
  if (!vaultAcc?.data) {
    console.error('Vault quote account not found.');
    process.exit(1);
  }
  const usdcMint = new PublicKey(vaultAcc.data.subarray(0, 32));

  const liquidatorAta = getAssociatedTokenAddressSync(usdcMint, liquidatorKp.publicKey);

  console.log('Liquidator started.');

  for (;;) {
    try {
      const positions = await connection.getProgramAccounts(PROGRAM_ID, {
        commitment: 'confirmed',
        filters: [
          { memcmp: { offset: 0, bytes: POSITION_DISCRIMINATOR.toString('base64') } },
        ],
      });

      const markets = await getAllMarkets();
      const marketByPk = new Map(markets.map((m) => [m.publicKey.toBase58(), m]));

      for (const { pubkey: positionPk, account } of positions) {
        const pos = coder.accounts.decode('position', account.data);
        const basePosition = Number(pos.basePosition ?? 0);
        if (basePosition === 0) continue;

        const owner = pos.owner as PublicKey;
        const marketPk = pos.market as PublicKey;
        const marketSym = marketByPk.get(marketPk.toBase58());
        if (!marketSym) continue;

        const symbol = marketSym.symbol;
        const collateralAcc = await connection.getAccountInfo(userCollateralPda(owner));
        if (!collateralAcc?.data) continue;
        const userColl = coder.accounts.decode('userCollateral', collateralAcc.data);
        const collateral = BigInt(userColl.collateralAmount?.toString() ?? '0');

        const marketAcc = await connection.getAccountInfo(marketPk);
        if (!marketAcc?.data) continue;
        const market = coder.accounts.decode('marketState', marketAcc.data);
        const markPrice = Number(market.lastOraclePrice ?? 0);
        if (markPrice <= 0) continue;
        const mmBps = Number(market.mmBps ?? 500);
        const entryPrice = Number(pos.entryPrice ?? 0);

        const health = accountHealthSingle(
          collateral,
          basePosition,
          entryPrice,
          markPrice,
          mmBps
        );
        if (health >= BigInt(0)) continue;

        const liquidateePositionPk = positionPdaFromSymbol(symbol, owner);
        const liquidateeCollateralPda = userCollateralPda(owner);
        const liquidateeTokenAccount = getAssociatedTokenAddressSync(usdcMint, owner);
        const marketPdaKey = marketPda(symbol);
        const bids = bidsPda(symbol);
        const asks = asksPda(symbol);

        try {
          await programWithWallet.methods
            .liquidate()
            .accounts({
              liquidator: liquidatorKp.publicKey,
              liquidatorTokenAccount: liquidatorAta,
              market: marketPdaKey,
              bids,
              ask: asks,
              eventQueue: eventQueuePda,
              liquidateePosition: liquidateePositionPk,
              liquidateeUserCollateral: liquidateeCollateralPda,
              liquidateeTokenAccount,
              globalConfig: globalConfigPda,
              usdcMint,
              insuranceFund,
              vaultQuote,
              systemProgram: SystemProgram.programId,
              associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
              tokenProgram: TOKEN_PROGRAM_ID,
            } as any)
            .rpc();
          console.log(`Liquidated position for ${owner.toBase58().slice(0, 8)}... on ${symbol}`);
        } catch (e: any) {
          if (e.message?.includes('NothingToLiquidate') || e.logs?.some((l: string) => l.includes('NothingToLiquidate'))) {
            // health was recomputed on-chain (e.g. funding) and no longer liquidatable
            continue;
          }
          console.error(`Liquidate ${owner.toBase58().slice(0, 8)} ${symbol}:`, e.message || e);
        }
      }
    } catch (e: any) {
      console.error('Liquidator loop error:', e.message || e);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main();
