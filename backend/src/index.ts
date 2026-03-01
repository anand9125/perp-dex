/**
 * Perp DEX Backend – exposes chain data for the mobile app.
 * Run: RPC_URL=https://api.devnet.solana.com node dist/index.js
 */
import express from 'express';
import cors from 'cors';
import { createRequire } from 'module';
import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, Idl } from '@coral-xyz/anchor';

const require = createRequire(import.meta.url);
const idl = require('../idl.json');

const PROGRAM_ID = new PublicKey(idl.address);
const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com';
const PORT = Number(process.env.PORT) || 3001;

const connection = new Connection(RPC_URL);
// Provider without wallet (read-only); wallet needed only for relay.
const provider = new AnchorProvider(connection, {} as any, { commitment: 'confirmed' });
const program = new Program(idl as Idl, provider);

// Account discriminators from IDL (first 8 bytes of account data)
const DISCRIMINATORS = {
  MarketState: Buffer.from([0, 125, 123, 215, 95, 96, 164, 194]),
  UserCollateral: Buffer.from([105, 117, 183, 100, 173, 169, 109, 65]),
  Position: Buffer.from([170, 188, 143, 228, 122, 64, 247, 208]),
};

const app = express();
app.use(cors());
app.use(express.json());

/** GET /api/config – program id and RPC URL (client may use its own RPC) */
app.get('/api/config', (_req, res) => {
  res.json({
    programId: PROGRAM_ID.toBase58(),
    rpcUrl: RPC_URL,
  });
});

/** GET /api/markets – all market accounts from chain */
app.get('/api/markets', async (_req, res) => {
  try {
    const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
      commitment: 'confirmed',
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: DISCRIMINATORS.MarketState.toString('base64'),
          },
        },
      ],
    });

    const coder = program.coder as any;
    const markets = accounts.map(({ pubkey, account }) => {
      try {
        const decoded = coder.accounts.decode('marketState', account.data);
        const symbol = decoded.symbol?.replace(/\0/g, '') || pubkey.toBase58().slice(0, 8);
        return {
          publicKey: pubkey.toBase58(),
          symbol,
          authority: decoded.authority?.toBase58(),
          lastOraclePrice: decoded.lastOraclePrice != null ? Number(decoded.lastOraclePrice) : 0,
          lastOracleTs: decoded.lastOracleTs != null ? Number(decoded.lastOracleTs) : 0,
          bid: decoded.bid?.toBase58(),
          asks: decoded.asks?.toBase58(),
          imBps: decoded.imBps ?? 0,
          mmBps: decoded.mmBps ?? 0,
          tickSize: decoded.tickSize ?? 0,
          stepSize: decoded.stepSize ?? 0,
          minOrderNotional: decoded.minOrderNotional != null ? Number(decoded.minOrderNotional) : 0,
        };
      } catch (e) {
        return null;
      }
    }).filter(Boolean);

    res.json({ markets });
  } catch (e: any) {
    console.error('GET /api/markets', e);
    res.status(500).json({ error: e?.message || 'Failed to fetch markets' });
  }
});

/** GET /api/user/:pubkey – user collateral and positions */
app.get('/api/user/:pubkey', async (req, res) => {
  const userPubkey = req.params.pubkey;
  if (!userPubkey) {
    return res.status(400).json({ error: 'Missing pubkey' });
  }
  try {
    const pubkey = new PublicKey(userPubkey);

    const [collateralPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('user_colletral'), pubkey.toBuffer()],
      PROGRAM_ID
    );

    const collateralAccount = await connection.getAccountInfo(collateralPda);
    let collateral = null;
    if (collateralAccount?.data) {
      const coder = program.coder as any;
      try {
        const decoded = coder.accounts.decode('userCollateral', collateralAccount.data);
        collateral = {
          owner: decoded.owner?.toBase58(),
          collateralAmount: decoded.collateralAmount != null ? decoded.collateralAmount.toString() : '0',
          lastUpdated: decoded.lastUpdated != null ? Number(decoded.lastUpdated) : 0,
        };
      } catch (_) {}
    }

    const positionsAccounts = await connection.getProgramAccounts(PROGRAM_ID, {
      commitment: 'confirmed',
      filters: [
        { memcmp: { offset: 0, bytes: DISCRIMINATORS.Position.toString('base64') } },
        { memcmp: { offset: 8, bytes: pubkey.toBase58() } },
      ],
    });

    const coder = program.coder as any;
    const positions = positionsAccounts.map(({ pubkey: posPubkey, account }) => {
      try {
        const decoded = coder.accounts.decode('position', account.data);
        return {
          publicKey: posPubkey.toBase58(),
          owner: decoded.owner?.toBase58(),
          market: decoded.market?.toBase58(),
          side: decoded.side,
          basePosition: decoded.basePosition != null ? Number(decoded.basePosition) : 0,
          entryPrice: decoded.entryPrice != null ? Number(decoded.entryPrice) : 0,
          realizedPnl: decoded.realizedPnl != null ? Number(decoded.realizedPnl) : 0,
          qty: decoded.qty != null ? Number(decoded.qty) : 0,
          status: decoded.status,
        };
      } catch (_) {
        return null;
      }
    }).filter(Boolean);

    res.json({ collateral, positions });
  } catch (e: any) {
    console.error('GET /api/user/:pubkey', e);
    res.status(500).json({ error: e?.message || 'Failed to fetch user' });
  }
});

/** POST /api/relay – submit a serialized signed transaction (base64) */
app.post('/api/relay', async (req, res) => {
  const { transaction: txBase64 } = req.body;
  if (!txBase64 || typeof txBase64 !== 'string') {
    return res.status(400).json({ error: 'Missing transaction (base64)' });
  }
  try {
    const raw = Buffer.from(txBase64, 'base64');
    const sig = await connection.sendRawTransaction(raw, { skipPreflight: false });
    res.json({ signature: sig });
  } catch (e: any) {
    console.error('POST /api/relay', e);
    res.status(500).json({ error: e?.message || 'Relay failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Perp DEX API http://localhost:${PORT} (RPC: ${RPC_URL})`);
});
