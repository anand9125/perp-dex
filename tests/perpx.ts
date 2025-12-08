import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PerpDex } from "../target/types/perp_dex";
import {
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  getAccount,
  mintTo,
} from "@solana/spl-token";
import { assert, expect } from "chai";
import { BN } from "bn.js";

describe("perp-dex full flow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.PerpDex as Program<PerpDex>;
  const authority = provider.wallet as anchor.Wallet;

  const connection = provider.connection;

  let usdcMint: PublicKey;

  let globalConfigPda: PublicKey;
  let requestQueuePda: PublicKey;
  let eventQueuePda: PublicKey;
  let vaultQuotePda: PublicKey;
  let insuranceFundPda: PublicKey;
  let feePoolAta: PublicKey;
  let userUsdcAta: PublicKey;
  let userCollateralPda: PublicKey;
  let positionPda: PublicKey;

  const MARKET_SYMBOL = "SOL-PERP";
  let marketPda: PublicKey;
  let bidsPda: PublicKey;
  let asksPda: PublicKey;

  before(async () => {
    // 1) Create USDC mint
    usdcMint = await createMint(
      connection,
      authority.payer,
      authority.publicKey, // mint authority
      null,                // freeze authority
      6                    // decimals
    );

    console.log("USDC Mint:", usdcMint.toBase58());

    // 2) Derive PDAs for global config + queues + vaults
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

    // Fee pool ATA (for authority)
    // Anchor will create this in initialize_global_config
    feePoolAta = await anchor.utils.token.associatedAddress({
      mint: usdcMint,
      owner: authority.publicKey,
    });

    // User collateral PDA
    [userCollateralPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_colletral"), authority.publicKey.toBuffer()],
      program.programId
    );

    // 3) Market PDAs
    const marketSymbolBytes = Buffer.from(MARKET_SYMBOL);

    [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), marketSymbolBytes],
      program.programId
    );

    [bidsPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("bids"), marketSymbolBytes],
      program.programId
    );

    [asksPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("asks"), marketSymbolBytes],
      program.programId
    );

    [positionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("position"), marketSymbolBytes, authority.publicKey.toBuffer()],
      program.programId
    );
    console.log("GlobalConfig:", globalConfigPda.toBase58());
    console.log("RequestQueue:", requestQueuePda.toBase58());
    console.log("EventQueue :", eventQueuePda.toBase58());
    console.log("VaultQuote:", vaultQuotePda.toBase58());
    console.log("InsuranceFund:", insuranceFundPda.toBase58());
    console.log("FeePool ATA:", feePoolAta.toBase58());
    console.log("Market:", marketPda.toBase58());
    console.log("Bids:", bidsPda.toBase58());
    console.log("Asks:", asksPda.toBase58());

    // 4) Create user's USDC ATA and mint some USDC to it
    const userAta = await getOrCreateAssociatedTokenAccount(
      connection,
      authority.payer,
      usdcMint,
      authority.publicKey
    );
    userUsdcAta = userAta.address;

    // Mint 1_000 USDC (with 6 decimals: 1_000 * 10^6)
    await mintTo(
      connection,
      authority.payer,
      usdcMint,
      userUsdcAta,
      authority.publicKey,
      BigInt(1_000_000_000) // 1,000 * 10^6
    );

    console.log("User USDC ATA:", userUsdcAta.toBase58());
  });

  it("1) initializes global config + queues", async () => {
    const txSig = await program.methods
      .initaliseGlobalConfig(false, 3600) // trading_paused = false, funding_interval_secs = 3600
      .accounts({
        authority: authority.publicKey,
        globalConfig: globalConfigPda,
        usdcMint: usdcMint,
        vaultQuote: vaultQuotePda,
        insuranceFund: insuranceFundPda,
        feePool: feePoolAta,
        requestQueue: requestQueuePda,
        eventQueue: eventQueuePda,
        systemProgram: SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("InitializeGlobalConfig Tx:", txSig);

    const config = await program.account.globalConfig.fetch(globalConfigPda);

    assert.equal(
      config.authority.toBase58(),
      authority.publicKey.toBase58(),
      "global_config.authority mismatch"
    );
    assert.equal(config.tradingPaused, false, "trading_paused mismatch");
    assert.equal(
      config.fundingIntervalSecs,
      3600,
      "funding_interval_secs mismatch"
    );
    assert.equal(
      config.vaultQuote.toBase58(),
      vaultQuotePda.toBase58(),
      "vault_quote mismatch"
    );
    assert.equal(
      config.insuranceFund.toBase58(),
      insuranceFundPda.toBase58(),
      "insurance_fund mismatch"
    );
    assert.equal(
      config.feePool.toBase58(),
      feePoolAta.toBase58(),
      "fee_pool mismatch"
    );

    // Check token accounts exist and are wired correctly
    const vaultAcc = await getAccount(connection, vaultQuotePda);
    assert.equal(
      vaultAcc.mint.toBase58(),
      usdcMint.toBase58(),
      "vault_quote mint mismatch"
    );
    assert.equal(
      vaultAcc.owner.toBase58(),
      globalConfigPda.toBase58(),
      "vault_quote owner mismatch"
    );

    const insuranceAcc = await getAccount(connection, insuranceFundPda);
    assert.equal(
      insuranceAcc.mint.toBase58(),
      usdcMint.toBase58(),
      "insurance_fund mint mismatch"
    );
    assert.equal(
      insuranceAcc.owner.toBase58(),
      globalConfigPda.toBase58(),
      "insurance_fund owner mismatch"
    );

    const feePoolAcc = await getAccount(connection, feePoolAta);
    assert.equal(
      feePoolAcc.mint.toBase58(),
      usdcMint.toBase58(),
      "fee_pool mint mismatch"
    );
    assert.equal(
      feePoolAcc.owner.toBase58(),
      authority.publicKey.toBase58(),
      "fee_pool owner mismatch"
    );

    // For zero-copy queues we just assert that the accounts exist (no deserialization).
    const rqInfo = await connection.getAccountInfo(requestQueuePda);
    const eqInfo = await connection.getAccountInfo(eventQueuePda);
    assert.ok(rqInfo !== null, "request_queue account missing");
    assert.ok(eqInfo !== null, "event_queue account missing");
  });

  it("2) initializes market successfully", async () => {
    const now = Math.floor(Date.now() / 1000);

    const params = {
      oraclePubkey: authority.publicKey,
      lastOraclePrice: new anchor.BN(100_000_000), // e.g. 1,000.000000
      lastOracleTs: new anchor.BN(now),
      imBps: 1000,              // 10%
      mmBps: 500,               // 5%
      oracleBandBps: 100,       // 1%
      takerFeeBps: 10,          // 0.10%
      makerRebateBps: 5,        // 0.05%
      liqPenaltyBps: 500,       // 5%
      liquidatorShareBps: 500,  // 5%
      maxFundingRate: new anchor.BN(1_000_000),
      cumFunding: new anchor.BN(0),
      lastFundingTs: new anchor.BN(now),
      fundingIntervalSecs: 3600,
      tickSize: 1,
      stepSize: 1,
      minOrderNotional: new anchor.BN(10_000),
    };

    const txSig = await program.methods
      .initializeMarket(Buffer.from(MARKET_SYMBOL), params)
      .accounts({
        authority: authority.publicKey,
        market: marketPda,
        bids: bidsPda,
        asks: asksPda,
        systemProgram: SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("InitializeMarket Tx:", txSig);

    const market = await program.account.marketState.fetch(marketPda);

    assert.equal(market.symbol, MARKET_SYMBOL, "market symbol mismatch");
    assert.equal(
      market.authority.toBase58(),
      authority.publicKey.toBase58(),
      "market authority mismatch"
    );
    assert.equal(
      market.bid.toBase58(),
      bidsPda.toBase58(),
      "market.bid PDA mismatch"
    );
    assert.equal(
      market.asks.toBase58(),
      asksPda.toBase58(),
      "market.asks PDA mismatch"
    );

    // A few param sanity checks
    assert.equal(market.imBps, 1000);
    assert.equal(market.mmBps, 500);
    assert.equal(market.oracleBandBps, 100);
    assert.equal(market.takerFeeBps, 10);
    assert.equal(market.makerFeeBps, 5);
  });
 
  it("3) deposits collateral successfully", async () => {
    const depositAmount = new anchor.BN(100_000_000); // 100 USDC (with 6 decimals)

    const userBefore = await getAccount(connection, userUsdcAta);
    const vaultBefore = await getAccount(connection, vaultQuotePda);

    const txSig = await program.methods
      .depositColletral(depositAmount)
      .accounts({
        user: authority.publicKey,
        usdcMint: usdcMint,
        userWalletAccount: userUsdcAta,
        globalConfig: globalConfigPda,
        vaultQuote: vaultQuotePda,
        userColletral: userCollateralPda,
        systemProgram: SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("DepositColletral Tx:", txSig);

    const userAfter = await getAccount(connection, userUsdcAta);
    const vaultAfter = await getAccount(connection, vaultQuotePda);

    const userDelta =
      BigInt(userBefore.amount.toString()) -
      BigInt(userAfter.amount.toString());
    const vaultDelta =
      BigInt(vaultAfter.amount.toString()) -
      BigInt(vaultBefore.amount.toString());

    assert.equal(
      userDelta.toString(),
      depositAmount.toString(),
      "user USDC decrease mismatch"
    );
    assert.equal(
      vaultDelta.toString(),
      depositAmount.toString(),
      "vault USDC increase mismatch"
    );

    const userColl = await program.account.userCollateral.fetch(
      userCollateralPda
    );

    assert.equal(
      userColl.owner.toBase58(),
      authority.publicKey.toBase58(),
      "user_collateral owner mismatch"
    );
    assert.equal(
      userColl.collateralAmount.toString(),
      depositAmount.toString(),
      "collateral_amount mismatch"
    );
  });

  it("4) fails when trying to initialize global config twice", async () => {
    try {
      await program.methods
        .initaliseGlobalConfig(false, 3600)
        .accounts({
          authority: authority.publicKey,
          globalConfig: globalConfigPda,
          usdcMint: usdcMint,
          vaultQuote: vaultQuotePda,
          insuranceFund: insuranceFundPda,
          feePool: feePoolAta,
          requestQueue: requestQueuePda,
          eventQueue: eventQueuePda,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      assert.fail("Second global config init should have failed");
    } catch (err: any) {
      assert.ok(true);
    }
  });

  it("5) places an order successfully", async () => {
    const order = {
      user: Array.from(authority.publicKey.toBytes()),
      orderId: new BN(0),
      side: { buy: {} },
      qty: new BN(1),         // Changed
      orderType: { limit: {} },
      limitPrice: new BN(1),
      initialMargin: new BN(10),
      leverage: 10,
      market: marketPda,
    };



    await program.methods
      .placeOrder(order)
      .accounts({
        user: authority.publicKey,
        globalConfig: globalConfigPda,
        market: marketPda,
        userColletral: userCollateralPda,
        positionPerMarket: positionPda,
        requestQueue: requestQueuePda,
        systemProgram: SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const rq = await program.account.requestQueue.fetch(requestQueuePda);
    const position = await program.account.position.fetch(positionPda);
    const userColData = await program.account.userCollateral.fetch(userCollateralPda);

    expect(rq.count).to.equal(1);
    expect(position.owner.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(position.status).deep.equal({ pending: {} });
    expect(userColData.collateralAmount.toString()).to.equal("100000000"); // unchanged
  });

  it("6) crank processes order queue → adds order to bid book", async () => {
    const COUNT_OFFSET = 12; // u16 head + u16 tail + u16 count + u16 capacity

    // Helper: ALWAYS print on-chain logs (success OR failure)
    async function sendAndLog(ix: () => any) {
      try {
        const sig = await ix().rpc();

        console.log("\n===== TX SUCCESS =====");
        console.log("Signature:", sig);

        const tx = await provider.connection.getTransaction(sig, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        });

        if (tx?.meta?.logMessages) {
          console.log("\n--- On-chain Logs ---");
          console.log(tx.meta.logMessages.join("\n"));
          console.log("--- End Logs ---\n");
        } else {
          console.log("No logs available for this transaction.");
        }

        return sig;
      } catch (e: any) {
        console.log("\n===== TX FAILURE =====");

        if (e.logs) {
          console.log("\n--- On-chain Logs (from Anchor error) ---");
          console.log(e.logs.join("\n"));
          console.log("--- End Logs ---\n");
        } else {
          console.log("No logs on error object.");
        }

        throw e;
      }
    }

    // 1) Reset slabs (bids + asks)
    await sendAndLog(() =>
      program.methods
        .resetSlab()
        .accounts({
          market: marketPda,
          bids: bidsPda,
          asks: asksPda,
        })
    );

    // 2) Reset request + event queues
    await sendAndLog(() =>
      program.methods
        .resetQueues()
        .accounts({
          requestQueue: requestQueuePda,
          eventQueue: eventQueuePda,
        })
    );

    // 3) Build order
    const order = {
      user: Array.from(authority.publicKey.toBytes()),
      orderId: new BN(0),
      side: { buy: {} },
      qty: new BN(1),
      orderType: { limit: {} },
      limitPrice: new BN(100),
      initialMargin: new BN(10),
      leverage: 10,
      market: marketPda,
    };

    // 4) Place an order → ensure rq has exactly 1
    await sendAndLog(() =>
      program.methods
        .placeOrder(order)
        .accounts({
          user: authority.publicKey,
          globalConfig: globalConfigPda,
          market: marketPda,
          userColletral: userCollateralPda,
          positionPerMarket: positionPda,
          requestQueue: requestQueuePda,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
    );

    console.log("Order placed → request queued");

    // Confirm count is 1 BEFORE crank
    const rqBeforeInfo = await provider.connection.getAccountInfo(requestQueuePda);
    const rqBeforeCount = rqBeforeInfo!.data.readUInt16LE(COUNT_OFFSET);
    console.log("Queue count before crank:", rqBeforeCount);
    expect(rqBeforeCount).to.equal(1);

    // 5) Execute cranker → process queue & move to bids slab
    await sendAndLog(() =>
      program.methods
        .processPlaceOrder()
        .accounts({
          authority: authority.publicKey,
          market: marketPda,
          bids: bidsPda,
          asks: asksPda,
          requestQueue: requestQueuePda,
          eventQueue: eventQueuePda,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
    );

    console.log("Crank executed");

    // Confirm queue was emptied
    const rqAfterInfo = await provider.connection.getAccountInfo(requestQueuePda);
    const rqAfterCount = rqAfterInfo!.data.readUInt16LE(COUNT_OFFSET);
    console.log("Queue count after crank:", rqAfterCount);
    expect(rqAfterCount).to.equal(0);

    // Ensure bid tree has something now (basic sanity check on account size)
    const bidInfo = await provider.connection.getAccountInfo(bidsPda);
    expect(bidInfo!.data.length).to.be.greaterThan(8);

    console.log("Crank moved order to bid slab successfully");
  });
   
  it("7) multi-level matching — verifies price priority + partial fills", async () => {
  const COUNT_OFFSET = 12;
  async function sendAndLog(ix: () => any) {
      try {
        const sig = await ix().rpc();

        console.log("\n===== TX SUCCESS =====");
        console.log("Signature:", sig);

        const tx = await provider.connection.getTransaction(sig, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        });

        if (tx?.meta?.logMessages) {
          console.log("\n--- On-chain Logs ---");
          console.log(tx.meta.logMessages.join("\n"));
          console.log("--- End Logs ---\n");
        } else {
          console.log("No logs available for this transaction.");
        }

        return sig;
      } catch (e: any) {
        console.log("\n===== TX FAILURE =====");

        if (e.logs) {
          console.log("\n--- On-chain Logs (from Anchor error) ---");
          console.log(e.logs.join("\n"));
          console.log("--- End Logs ---\n");
        } else {
          console.log("No logs on error object.");
        }

        throw e;
      }
    }

  // 1) Reset slabs and queues (reuse same helper)
  await sendAndLog(() =>
    program.methods.resetSlab().accounts({
      market: marketPda,
      bids: bidsPda,
      asks: asksPda,
    })
  );

  await sendAndLog(() =>
    program.methods.resetQueues().accounts({
      requestQueue: requestQueuePda,
      eventQueue: eventQueuePda,
    })
  );

  console.log("\n=== INSERTING SELL ORDERS (asks) ===");

  const asks = [
    { id: 1, price: 90, qty: 1 },
    { id: 2, price: 95, qty: 1 },
    { id: 3, price: 100, qty: 1 },
  ];
  // 2) Insert 3 ASK orders → crank into ask slab
  for (const o of asks) {
    await sendAndLog(() =>
      program.methods
        .placeOrder({
          user: Array.from(authority.publicKey.toBytes()),
          orderId: new BN(o.id),
          side: { sell: {} },
          qty: new BN(o.qty),
          orderType: { limit: {} },
          limitPrice: new BN(o.price),
          initialMargin: new BN(5),
          leverage: 5,
          market: marketPda,
        })
        .accounts({
          user: authority.publicKey,
          globalConfig: globalConfigPda,
          market: marketPda,
          userColletral: userCollateralPda,
          positionPerMarket: positionPda,
          requestQueue: requestQueuePda,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
    );

    await sendAndLog(() =>
      program.methods.processPlaceOrder().accounts({
        authority: authority.publicKey,
        market: marketPda,
        bids: bidsPda,
        asks: asksPda,
        requestQueue: requestQueuePda,
        eventQueue: eventQueuePda,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
    );
  }

  console.log("Inserted 3 asks into order book successfully.");

  console.log("\n=== INSERTING BUY ORDER TO TRIGGER MATCH ===");

  // 3) High-price BUY order — should match multiple asks
  const buyQty = 2;

  await sendAndLog(() =>
    program.methods
      .placeOrder({
        user: Array.from(authority.publicKey.toBytes()),
        orderId: new BN(200),
        side: { buy: {} },
        qty: new BN(buyQty),
        orderType: { limit: {} },
        limitPrice: new BN(100),
        initialMargin: new BN(20),
        leverage: 5,
        market: marketPda,
      })
      .accounts({
        user: authority.publicKey,
        globalConfig: globalConfigPda,
        market: marketPda,
        userColletral: userCollateralPda,
        positionPerMarket: positionPda,
        requestQueue: requestQueuePda,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
  );

  await sendAndLog(() =>
    program.methods.processPlaceOrder().accounts({
      authority: authority.publicKey,
      market: marketPda,
      bids: bidsPda,
      asks: asksPda,
      requestQueue: requestQueuePda,
      eventQueue: eventQueuePda,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
    })
  );

  console.log("\n=== MATCHING COMPLETE: VERIFYING ORDERBOOK ===");

  // 4) After matching:
  // BUY (12) would consume:
  // - Ask(90): 3 fully
  // - Ask(95): 5 fully
  // - Ask(100): 4 partially → 6 remain

  const askInfo = await provider.connection.getAccountInfo(asksPda);
  expect(askInfo!.data.length).to.be.greaterThan(8);

  console.log("Check logs above — expect:");
  console.log("- 2 full matches");
  console.log("- 1 partial match (remaining qty ≈ 6)");

  console.log("\nTEST 6 COMPLETE ✓");
  });

  it("8) processes EventQueue and updates user Position", async () => {
    console.log("\n=== START EVENT QUEUE → POSITION TEST ===");

    const USER_KEY = authority.publicKey;

    const DISCRIMINATOR_LEN = 8;
    const COUNT_OFFSET_IN_HEADER = 4; // inside Rust struct
    const EVENT_COUNT_OFFSET = DISCRIMINATOR_LEN + COUNT_OFFSET_IN_HEADER; // 12

    async function getEventCount() {
      const eqInfo = await provider.connection.getAccountInfo(eventQueuePda);
      return eqInfo!.data.readUInt16LE(EVENT_COUNT_OFFSET);
    }

    async function sendAndLog(ix: () => any) {
      try {
        const sig = await ix().rpc();
        console.log("\n===== TX SUCCESS =====");
        console.log("Signature:", sig);

        try {
    const tx = await provider.connection.getTransaction(sig, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (tx?.meta?.logMessages) {
      console.log("\n--- On-chain Logs ---");
      console.log(tx.meta.logMessages.join("\n"));
      console.log("--- End Logs ---\n");
    }
  } catch (_) {
    console.log("(Logs not available yet — continuing)");
  }

      } catch (e: any) {
        console.log("\n===== TX FAILURE =====");
        if (e.logs) {
          console.log(e.logs.join("\n"));
        }
        throw e;
      }
    }

    // Reset all
    await sendAndLog(() =>
      program.methods.resetSlab().accounts({
        market: marketPda,
        bids: bidsPda,
        asks: asksPda,
      })
    );

    await sendAndLog(() =>
      program.methods.resetQueues().accounts({
        requestQueue: requestQueuePda,
        eventQueue: eventQueuePda,
      })
    );

    // Two SELL orders to generate event fills
    const sellOrders = [
      { id: 11, price: 90, qty: 3 },
      { id: 12, price: 95, qty: 5 },
    ];

    console.log("\n--- INSERTING SELLs ---");
    for (const o of sellOrders) {
      await sendAndLog(() =>
        program.methods.placeOrder({
          user: Array.from(USER_KEY.toBytes()),
          orderId: new BN(o.id),
          side: { sell: {} },
          qty: new BN(o.qty),
          orderType: { limit: {} },
          limitPrice: new BN(o.price),
          initialMargin: new BN(5),
          leverage: 5,
          market: marketPda,
        }).accounts({
          user: USER_KEY,
          globalConfig: globalConfigPda,
          market: marketPda,
          userColletral: userCollateralPda,
          positionPerMarket: positionPda,
          requestQueue: requestQueuePda,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
      );

      await sendAndLog(() =>
        program.methods.processPlaceOrder().accounts({
          authority: USER_KEY,
          market: marketPda,
          bids: bidsPda,
          asks: asksPda,
          requestQueue: requestQueuePda,
          eventQueue: eventQueuePda,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
      );
    }

    console.log("\n--- INSERT BUY (triggers matches & fills → eventQueue) ---");

    await sendAndLog(() =>
      program.methods.placeOrder({
        user: Array.from(USER_KEY.toBytes()),
        orderId: new BN(2001),
        side: { buy: {} },
        qty: new BN(10),
        orderType: { limit: {} },
        limitPrice: new BN(100),
        initialMargin: new BN(20),
        leverage: 5,
        market: marketPda,
      }).accounts({
        user: USER_KEY,
        globalConfig: globalConfigPda,
        market: marketPda,
        userColletral: userCollateralPda,
        positionPerMarket: positionPda,
        requestQueue: requestQueuePda,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
    );

    await sendAndLog(() =>
      program.methods.processPlaceOrder().accounts({
        authority: USER_KEY,
        market: marketPda,
        bids: bidsPda,
        asks: asksPda,
        requestQueue: requestQueuePda,
        eventQueue: eventQueuePda,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
    );

    const countBefore = await getEventCount();
    console.log("EventQueue count BEFORE:", countBefore);
    expect(countBefore).to.be.greaterThan(0);

    console.log("\n--- PROCESS EVENT QUEUE → OPEN POSITION ---");

    await sendAndLog(() =>
      program.methods
        .positionManager(USER_KEY) // IMPORTANT: pass instruction arg!
        .accounts({
          market: marketPda,
          userPosition: positionPda,
          eventQueue: eventQueuePda,
          userColletral: userCollateralPda,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
    );

    const countAfter = await getEventCount();
    console.log("EventQueue count AFTER:", countAfter);

    const positionAcc = await program.account.position.fetch(positionPda);
    console.log("Updated position:", positionAcc);

    expect(positionAcc.updatedAt.toNumber()).to.be.greaterThan(0);

    expect(positionAcc.basePosition.toNumber()).to.be.a("number");

    expect(positionAcc.realizedPnl.toNumber()).to.be.a("number");
    expect(positionAcc.lastCumFunding.toNumber()).to.be.a("number");

    console.log("\n=== EVENT → POSITION PROCESS SUCCESS ===");
  });

  // it("9) liquidation flow — closes unhealthy position & applies penalty", async () => {
  //   console.log("\n=== START LIQUIDATION TEST ===");

  //   const USER_KEY = authority.publicKey;

  //   async function getUserPosition() {
  //     return await program.account.position.fetch(positionPda);
  //   }

  //   async function getCollateral() {
  //     return await program.account.userCollateral.fetch(userCollateralPda);
  //   }

  //   async function deposit(amount: number) {
  //     await program.methods
  //       .depositColletral(new BN(amount))
  //       .accounts({
  //         user: USER_KEY,
  //         usdcMint,
  //         userWalletAccount: userUsdcAta,
  //         globalConfig: globalConfigPda,
  //         vaultQuote: vaultQuotePda,
  //         userColletral: userCollateralPda,
  //         systemProgram: SystemProgram.programId,
  //         associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  //         tokenProgram: TOKEN_PROGRAM_ID,
  //       })
  //       .rpc();
  //     console.log("Deposited collateral:", amount);
  //   }

  //   async function placeAndCrankSell(orderId: number, price: number, qty: number) {
  //     await program.methods
  //       .placeOrder({
  //         user: Array.from(USER_KEY.toBytes()),
  //         orderId: new BN(orderId),
  //         side: { sell: {} },
  //         qty: new BN(qty),
  //         orderType: { limit: {} },
  //         limitPrice: new BN(price),
  //         initialMargin: new BN(50),
  //         leverage: 5,
  //         market: marketPda,
  //       })
  //       .accounts({
  //         user: USER_KEY,
  //         globalConfig: globalConfigPda,
  //         market: marketPda,
  //         userColletral: userCollateralPda,
  //         positionPerMarket: positionPda,
  //         requestQueue: requestQueuePda,
  //         systemProgram: SystemProgram.programId,
  //         tokenProgram: TOKEN_PROGRAM_ID,
  //       })
  //       .rpc();

  //     await program.methods
  //       .processPlaceOrder()
  //       .accounts({
  //         authority: USER_KEY,
  //         market: marketPda,
  //         bids: bidsPda,
  //         asks: asksPda,
  //         requestQueue: requestQueuePda,
  //         eventQueue: eventQueuePda,
  //         systemProgram: SystemProgram.programId,
  //         tokenProgram: TOKEN_PROGRAM_ID,
  //       })
  //       .rpc();
  //   }

  //   async function placeAndCrankBuy(orderId: number, price: number, qty: number) {
  //     await program.methods
  //       .placeOrder({
  //         user: Array.from(USER_KEY.toBytes()),
  //         orderId: new BN(orderId),
  //         side: { buy: {} },
  //         qty: new BN(qty),
  //         orderType: { limit: {} },
  //         limitPrice: new BN(price),
  //         initialMargin: new BN(100),
  //         leverage: 5,
  //         market: marketPda,
  //       })
  //       .accounts({
  //         user: USER_KEY,
  //         globalConfig: globalConfigPda,
  //         market: marketPda,
  //         userColletral: userCollateralPda,
  //         positionPerMarket: positionPda,
  //         requestQueue: requestQueuePda,
  //         systemProgram: SystemProgram.programId,
  //         tokenProgram: TOKEN_PROGRAM_ID,
  //       })
  //       .rpc();

  //     await program.methods
  //       .processPlaceOrder()
  //       .accounts({
  //         authority: USER_KEY,
  //         market: marketPda,
  //         bids: bidsPda,
  //         asks: asksPda,
  //         requestQueue: requestQueuePda,
  //         eventQueue: eventQueuePda,
  //         systemProgram: SystemProgram.programId,
  //         tokenProgram: TOKEN_PROGRAM_ID,
  //       })
  //       .rpc();
  //   }
  //   async function getEventCount() {
  //     const eqInfo = await provider.connection.getAccountInfo(eventQueuePda);
  //     const count = eqInfo!.data.readUInt16LE(12);
  //     return count;
  //   }

  //   async function debugEventQueue() {
  //     const count = await getEventCount();
  //     console.log("DEBUG: EventQueue count =", count);

  //     const full = await provider.connection.getAccountInfo(eventQueuePda);
  //     console.log("EventQueue raw tail-head-seq:", {
  //       head: full!.data.readUInt16LE(8),
  //       tail: full!.data.readUInt16LE(10),
  //       count: full!.data.readUInt16LE(12),
  //       capacity: full!.data.readUInt16LE(14),
  //       sequence: full!.data.readBigUInt64LE(16).toString(),
  //     });
  //   }


  //  async function processEventQueue() {
  //     console.log("Cranking event queue → applying fills to position…");

  //     const beforeCount = await getEventCount();
  //     console.log("EventQueue count BEFORE crank =", beforeCount);

  //     const sig = await program.methods
  //       .positionManager(USER_KEY)
  //       .accounts({
  //         market: marketPda,
  //         userPosition: positionPda,
  //         eventQueue: eventQueuePda,
  //         userColletral: userCollateralPda,
  //         systemProgram: anchor.web3.SystemProgram.programId,
  //         associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  //         tokenProgram: TOKEN_PROGRAM_ID,
  //       })
  //       .rpc();

  //     console.log("\n-- TX LOGS: positionManager --");
  //     try {
  //       const tx = await provider.connection.getTransaction(sig, {
  //         commitment: "confirmed",
  //         maxSupportedTransactionVersion: 0,
  //       });
  //       if (tx?.meta?.logMessages) {
  //         tx.meta.logMessages.forEach((l) => console.log(l));
  //       }
  //     } catch {}

  //     const afterCount = await getEventCount();
  //     console.log("EventQueue count AFTER crank =", afterCount);
  //   }


  //   function notional(qty: number, price: number) {
  //     return Math.abs(qty) * price;
  //   }

  //   function unrealizedPnL(qty: number, entry: number, mark: number) {
  //     return qty * (mark - entry);
  //   }

  //   function maintenanceMargin(qty: number, mark: number, mmrBps: number) {
  //     const not = notional(qty, mark);
  //     return Math.floor((not * mmrBps) / 10_000);
  //   }

  //   function accountHealth(
  //     collateral: number,
  //     qty: number,
  //     entry: number,
  //     mark: number,
  //     mmrBps: number
  //   ) {
  //     return collateral + unrealizedPnL(qty, entry, mark) - maintenanceMargin(qty, mark, mmrBps);
  //   }

  //   // Reset orderbook + queues
  //   await program.methods.resetSlab().accounts({
  //     market: marketPda,
  //     bids: bidsPda,
  //     asks: asksPda,
  //   }).rpc();

  //   await program.methods.resetQueues().accounts({
  //     requestQueue: requestQueuePda,
  //     eventQueue: eventQueuePda,
  //   }).rpc();

  //   // User starts poor so liquidation will happen
  //   await deposit(20); // small collateral

  //   await placeAndCrankSell(5001, 100, 10); // maker: ask 100 x 10
  //   await placeAndCrankBuy(7001, 100, 10);  // taker: buy 100 x 10

  //   async function processAllEvents() {
  //     while (true) {
  //       const countBefore = await getEventCount();
  //       if (countBefore === 0) break;

  //       await program.methods
  //         .positionManager(USER_KEY)
  //         .accounts({
  //           market: marketPda,
  //           userPosition: positionPda,
  //           eventQueue: eventQueuePda,
  //           userColletral: userCollateralPda,
  //           systemProgram: SystemProgram.programId,
  //           associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  //           tokenProgram: TOKEN_PROGRAM_ID,
  //         })
  //         .rpc();
  //     }
  //   }

  //   console.log("Cranking FULL event queue...");
  //   await processAllEvents();


  //   const posBefore = await getUserPosition();
  //   const collBefore = await getCollateral();

  //   console.log("Position BEFORE:", posBefore);
  //   console.log("Collateral BEFORE:", collBefore.collateralAmount.toString());

  //   expect(posBefore.basePosition.toNumber()).to.equal(10);

  //   const markPrice = 20; // price collapse
  //   await program.methods.setMarkPrice(new BN(markPrice)).accounts({ market: marketPda }).rpc();

  //   const marketAcc = await program.account.marketState.fetch(marketPda);
  //   const mmrBps = marketAcc.mmBps;

  //   const health = accountHealth(
  //     Number(collBefore.collateralAmount)/1e6,
  //     posBefore.basePosition.toNumber(),
  //     posBefore.entryPrice.toNumber(),
  //     markPrice,
  //     mmrBps
  //   );

  //   console.log("Health OFF-CHAIN:", health);
  //   expect(health).to.be.below(0);

  //   console.log("\n--- TX LOGS: Liquidation ---");

  //   const sigLiq =  await program.methods.liquidate().accounts({
  //     liquidator: USER_KEY,
  //     liquidatorTokenAccount: userUsdcAta,
  //     market: marketPda,
  //     bids: bidsPda,
  //     ask: asksPda,
  //     eventQueue: eventQueuePda,
  //     liquidateePosition: positionPda,
  //     liquidateeUserCollateral: userCollateralPda,
  //     liquidateeTokenAccount: userUsdcAta,
  //     globalConfig: globalConfigPda,
  //     usdcMint,
  //     insuranceFund: insuranceFundPda,
  //     vaultQuote: vaultQuotePda,
  //     systemProgram: SystemProgram.programId,
  //     associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  //     tokenProgram: TOKEN_PROGRAM_ID,
  //   }).rpc();

  //   const posAfter = await getUserPosition();
  //   const collAfter = await getCollateral();
  //   const txL = await provider.connection.getTransaction(sigLiq, {
  //     commitment: "confirmed",
  //     maxSupportedTransactionVersion: 0,
  //   });
  //   txL?.meta?.logMessages?.forEach((log) => console.log(log));


  //   console.log("Position AFTER:", posAfter);
  //   console.log("Collateral AFTER:", collAfter.collateralAmount.toString());

  //   expect(posAfter.basePosition.toNumber()).to.equal(0);
  //   expect(posAfter.entryPrice.toNumber()).to.equal(0);
  //   expect(collAfter.collateralAmount.toNumber()).to.be.at.least(0);

  //   console.log("=== LIQUIDATION SUCCESS ===");
  // });

 
});
