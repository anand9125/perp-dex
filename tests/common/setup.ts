import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { PerpDex } from "../../target/types/perp_dex";
import { assert } from "chai";


export const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

export const program = anchor.workspace.PerpDex as Program<PerpDex>;
 export const authority = provider.wallet as anchor.Wallet;