/**
 * Anchor Program and Connection for perp-dex. Use after shim is loaded.
 */
import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, Idl } from '@coral-xyz/anchor';
import { getRpcUrl } from './config';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const idl = require('../idl/perp_dex.json');

const PROGRAM_ID = new PublicKey(idl.address);

let _connection: Connection | null = null;
let _program: Program | null = null;

export function getConnection(rpcUrl?: string): Connection {
  if (!_connection) {
    _connection = new Connection(rpcUrl || getRpcUrl(), 'confirmed');
  }
  return _connection;
}

export function getProgram(rpcUrl?: string): Program {
  if (!_program) {
    const connection = getConnection(rpcUrl);
    const provider = new AnchorProvider(
      connection,
      {} as any,
      { commitment: 'confirmed' }
    );
    _program = new Program(idl as Idl, provider);
  }
  return _program;
}

export { PROGRAM_ID };
