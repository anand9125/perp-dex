/**
 * PDA derivation for the perp-dex program. Matches on-chain seeds.
 */
import { PublicKey } from '@solana/web3.js';

const PROGRAM_ID = new PublicKey('81dJfLhAbLPYQKbEHskyLvQdzbQffJzG9tVVfFRhpZ6p');

export function getGlobalConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('global_config')],
    PROGRAM_ID
  );
}

export function getRequestQueuePda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('request_queue')],
    PROGRAM_ID
  );
}

export function getEventQueuePda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('event_queue')],
    PROGRAM_ID
  );
}

export function getMarketPda(symbol: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('market'), Buffer.from(symbol)],
    PROGRAM_ID
  );
}

export function getBidsPda(symbol: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('bids'), Buffer.from(symbol)],
    PROGRAM_ID
  );
}

export function getAsksPda(symbol: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('asks'), Buffer.from(symbol)],
    PROGRAM_ID
  );
}

export function getUserCollateralPda(user: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('user_colletral'), user.toBuffer()],
    PROGRAM_ID
  );
}

export function getPositionPda(marketSymbol: string, user: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('position'), Buffer.from(marketSymbol), user.toBuffer()],
    PROGRAM_ID
  );
}
