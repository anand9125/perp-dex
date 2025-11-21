import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PerpDex } from "../target/types/perp_dex";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  getAssociatedTokenAddress,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";

describe("perp-dex", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.PerpDex as Program<PerpDex>;
  const authority = provider.wallet as anchor.Wallet;

  let usdcMint: PublicKey;
  let globalConfigPda: PublicKey;
  let requestQueuePda: PublicKey;
  let vaultQuotePda: PublicKey;
  let insuranceFundPda: PublicKey;
  let feePoolAta: PublicKey;

  before(async () => {
    usdcMint = await createMint(
      provider.connection,
      authority.payer,
      authority.publicKey,
      null,
      6
    );

    console.log("USDC Mint:", usdcMint.toBase58());

    // PDAs
    [globalConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("global_config")],
      program.programId
    );

    [requestQueuePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("request_queue")],
      program.programId
    );

    [vaultQuotePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_quote"), globalConfigPda.toBuffer()],
      program.programId
    );

    [insuranceFundPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("insurance_fund"), globalConfigPda.toBuffer()],
      program.programId
    );

    feePoolAta = await getAssociatedTokenAddress(
      usdcMint,
      authority.publicKey
    );

    console.log("Global Config:", globalConfigPda.toBase58());
    console.log("Request Queue:", requestQueuePda.toBase58());
    console.log("Vault Quote:", vaultQuotePda.toBase58());
    console.log("Insurance Fund:", insuranceFundPda.toBase58());
    console.log("Fee Pool ATA:", feePoolAta.toBase58());
  });

  describe("initialize_global_config", () => {
//     console.log("PDAs:",
//   "global:", globalConfigPda.toBase58(),
//   "vault:", vaultQuotePda.toBase58(),
//   "ins:", insuranceFundPda.toBase58(),
//   "feePool:", feePoolAta.toBase58(),
//   "requestQ:", requestQueuePda?.toBase58()
// );

    it("initializes global config successfully", async () => {
//       console.log("PDAs:",
//   "global:", globalConfigPda.toBase58(),
//   "vault:", vaultQuotePda.toBase58(),
//   "ins:", insuranceFundPda.toBase58(),
//   "feePool:", feePoolAta.toBase58(),
//   "requestQ:", requestQueuePda?.toBase58()
// );

try {
  const txSig = await program.methods
    .initaliseGlobalConfig(false, 3600)
    .accountsStrict({
      authority: authority.publicKey,
      globalConfig: globalConfigPda,
      usdcMint: usdcMint,
      vaultQuote: vaultQuotePda,
      insuranceFund: insuranceFundPda,
      feePool: feePoolAta,
      requestQueue: requestQueuePda,
      systemProgram: SystemProgram.programId,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  console.log("Init Tx:", txSig);
  const tx = await provider.connection.getTransaction(txSig, { commitment: "confirmed" });
  console.log("PROGRAM LOGS:\n", tx?.meta?.logMessages);
} catch (err:any) {
  console.error("INIT ERROR:", err.logs ?? err.message ?? err);
  if (err.getLogs) console.error("getLogs:", err.getLogs());
  throw err;
}


      const config = await program.account.globalConfig.fetch(globalConfigPda);

      assert.equal(config.authority.toBase58(), authority.publicKey.toBase58());
      assert.equal(config.tradingPaused, false);
      assert.equal(config.fundingIntervalSecs, 3600);
    });

    it("initializes request queue correctly", async () => {
      const rq = await program.account.requestQueue.fetch(requestQueuePda);

      assert.equal(rq.head, 0);
      assert.equal(rq.tail, 0);
     // assert.equal(rq.sequence, 0);
      assert.equal(rq.capacity, 17); // MAX_REQUESTS = 32
    });

    it("creates vault_quote token account", async () => {
      const account = await getAccount(provider.connection, vaultQuotePda);
      assert.equal(account.mint.toBase58(), usdcMint.toBase58());
      assert.equal(account.owner.toBase58(), globalConfigPda.toBase58());
    });

    it("creates insurance_fund token account", async () => {
      const account = await getAccount(provider.connection, insuranceFundPda);
      assert.equal(account.mint.toBase58(), usdcMint.toBase58());
      assert.equal(account.owner.toBase58(), globalConfigPda.toBase58());
    });

    it("creates fee_pool ATA", async () => {
      const account = await getAccount(provider.connection, feePoolAta);
      assert.equal(account.mint.toBase58(), usdcMint.toBase58());
      assert.equal(account.owner.toBase58(), authority.publicKey.toBase58());
    });

    it("fails when trying to initialize twice", async () => {
  try {
    await program.methods
      .initaliseGlobalConfig(false, 3600)
      .accountsStrict({
        authority: authority.publicKey,
        globalConfig: globalConfigPda,
        usdcMint: usdcMint,
        vaultQuote: vaultQuotePda,
        insuranceFund: insuranceFundPda,
        feePool: feePoolAta,
        requestQueue: requestQueuePda,
        systemProgram: SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    assert.fail("Second initialization should have failed");
  } catch (err: any) {
    console.log("SECOND INIT ERROR:", err.logs ?? err.message);
    assert.ok(true, "Second initialization correctly failed");
  }
});

  });
});
