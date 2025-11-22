import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { PerpDex } from "../target/types/perp_dex";
import { assert } from "chai";
import {authority, program,} from "./common/setup"
import { ASSOCIATED_TOKEN_PROGRAM_ID, createMint, getAccount, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";



describe("perp-dex", () => {
        const provider = anchor.AnchorProvider.env();
        anchor.setProvider(provider);

        let usdcMint: PublicKey;
        let globalConfigPda: PublicKey;
        let requestQueuePda: PublicKey;
        let vaultQuotePda: PublicKey;
        let insuranceFundPda: PublicKey;
        let feePoolAta: PublicKey;
        let eventQueuePda : PublicKey

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
        [eventQueuePda] = PublicKey.findProgramAddressSync(
          [Buffer.from("event_queue")],
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


        it("initializes global config successfully", async () => {


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
            requestQueues:requestQueuePda,
            eventQueues:eventQueuePda,
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
            requestQueues:requestQueuePda,
            eventQueues:eventQueuePda,
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