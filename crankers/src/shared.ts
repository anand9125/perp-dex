/**
 * Shared client for crankers: connection, program, PDAs, queue helpers.
 */
import Module from 'module';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, Idl } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const createRequire = Module.createRequire;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const requireIdl = createRequire(import.meta.url);
const idlPath = path.join(__dirname, '..', '..', 'target', 'idl', 'perp_dex.json');
const idl = requireIdl(idlPath);

export { idl };
export const PROGRAM_ID = new PublicKey(idl.address);
export const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com';

export const connection = new Connection(RPC_URL, 'confirmed');

export function getAuthorityKeypair(): Keypair {
  if (process.env.CRANKER_AUTHORITY_KEYPAIR) {
    try {
      const parsed = JSON.parse(process.env.CRANKER_AUTHORITY_KEYPAIR);
      return Keypair.fromSecretKey(Uint8Array.from(parsed));
    } catch {
      return Keypair.fromSecretKey(Buffer.from(process.env.CRANKER_AUTHORITY_KEYPAIR!, 'base64'));
    }
  }
  const keyPath = process.env.ANCHOR_WALLET || path.join(process.env.HOME || '', '.config/solana/id.json');
  const data = fs.readFileSync(keyPath, 'utf-8');
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(data)));
}

export function getLiquidatorKeypair(): Keypair {
  if (process.env.LIQUIDATOR_KEYPAIR) {
    try {
      const parsed = JSON.parse(process.env.LIQUIDATOR_KEYPAIR);
      return Keypair.fromSecretKey(Uint8Array.from(parsed));
    } catch {
      return Keypair.fromSecretKey(Buffer.from(process.env.LIQUIDATOR_KEYPAIR, 'base64'));
    }
  }
  const keyPath = process.env.ANCHOR_WALLET || path.join(process.env.HOME || '', '.config/solana/id.json');
  const data = fs.readFileSync(keyPath, 'utf-8');
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(data)));
}

const provider = new AnchorProvider(connection, {} as any, { commitment: 'confirmed' });
export const program = new Program(idl as Idl, provider);

// Queue layout: 8-byte discriminator + head(u16) + tail(u16) + count(u16) + ...
const QUEUE_HEAD_OFFSET = 8;
const QUEUE_COUNT_OFFSET = 8 + 2 + 2; // 12
const EVENT_QUEUE_SLOT_OFFSET = 8 + 2 + 2 + 2 + 2 + 8; // 24 (after sequence u64)
const EVENT_SLOT_SIZE = 128 + 2 + 1 + 5; // data[128] + len(u16) + is_occupied(u8) + _pad[5] = 136
// MatchedOrder (Borsh): is_maker(1) + order_id(16) + user(32) + ...
const MATCHED_ORDER_USER_OFFSET = 1 + 16; // 17
const MATCHED_ORDER_USER_LEN = 32;

export const requestQueuePda = PublicKey.findProgramAddressSync(
  [Buffer.from('request_queue')],
  PROGRAM_ID
)[0];

export const eventQueuePda = PublicKey.findProgramAddressSync(
  [Buffer.from('event_queue')],
  PROGRAM_ID
)[0];

export const globalConfigPda = PublicKey.findProgramAddressSync(
  [Buffer.from('global_config')],
  PROGRAM_ID
)[0];

export async function getRequestQueueCount(): Promise<number> {
  const info = await connection.getAccountInfo(requestQueuePda);
  if (!info?.data || info.data.length < QUEUE_COUNT_OFFSET + 2) return 0;
  return info.data.readUInt16LE(QUEUE_COUNT_OFFSET);
}

export async function getEventQueueCount(): Promise<number> {
  const info = await connection.getAccountInfo(eventQueuePda);
  if (!info?.data || info.data.length < QUEUE_COUNT_OFFSET + 2) return 0;
  return info.data.readUInt16LE(QUEUE_COUNT_OFFSET);
}

/**
 * Peek the user pubkey (32 bytes) at the head of the event queue without consuming.
 * Returns null if queue is empty or decode fails.
 */
export function peekEventQueueHeadUser(data: Buffer): PublicKey | null {
  const count = data.readUInt16LE(QUEUE_COUNT_OFFSET);
  if (count === 0) return null;
  const head = data.readUInt16LE(QUEUE_HEAD_OFFSET);
  const slotOffset = EVENT_QUEUE_SLOT_OFFSET + head * EVENT_SLOT_SIZE;
  const isOccupied = data[slotOffset + 128 + 2]; // after data[128] and len(u16)
  if (isOccupied !== 1) return null;
  const len = data.readUInt16LE(slotOffset + 128);
  if (len < MATCHED_ORDER_USER_OFFSET + MATCHED_ORDER_USER_LEN) return null;
  const userBytes = data.subarray(slotOffset + MATCHED_ORDER_USER_OFFSET, slotOffset + MATCHED_ORDER_USER_OFFSET + MATCHED_ORDER_USER_LEN);
  return new PublicKey(userBytes);
}

export function marketPda(symbol: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('market'), Buffer.from(symbol)],
    PROGRAM_ID
  )[0];
}

export function bidsPda(symbol: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('bids'), Buffer.from(symbol)],
    PROGRAM_ID
  )[0];
}

export function asksPda(symbol: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('asks'), Buffer.from(symbol)],
    PROGRAM_ID
  )[0];
}

export function positionPdaFromSymbol(symbol: string, userPk: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('position'), Buffer.from(symbol), userPk.toBuffer()],
    PROGRAM_ID
  )[0];
}

export function userCollateralPda(userPk: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('user_colletral'), userPk.toBuffer()],
    PROGRAM_ID
  )[0];
}

const MARKET_DISCRIMINATOR = Buffer.from([0, 125, 123, 215, 95, 96, 164, 194]);

export interface MarketInfo {
  symbol: string;
  publicKey: PublicKey;
}

export async function getAllMarkets(): Promise<MarketInfo[]> {
  let accounts: Awaited<ReturnType<Connection['getProgramAccounts']>>;
  try {
    accounts = await connection.getProgramAccounts(PROGRAM_ID, {
      commitment: 'confirmed',
      filters: [
        { memcmp: { offset: 0, bytes: MARKET_DISCRIMINATOR.toString('base64') } },
      ],
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('Base58') || msg.includes('Invalid')) {
      const all = await connection.getProgramAccounts(PROGRAM_ID, { commitment: 'confirmed' });
      accounts = all.filter(
        (a) =>
          a.account.data.length >= 8 &&
          MARKET_DISCRIMINATOR.equals(Buffer.from(a.account.data.subarray(0, 8)))
      );
    } else {
      throw e;
    }
  }
  const coder = program.coder as any;
  const out: MarketInfo[] = [];
  for (const { pubkey, account } of accounts) {
    try {
      const decoded = coder.accounts.decode('marketState', account.data);
      const symbol = (decoded.symbol as string)?.replace(/\0/g, '').trim() || pubkey.toBase58().slice(0, 8);
      out.push({ symbol, publicKey: pubkey });
    } catch (_) {}
  }
  return out;
}
