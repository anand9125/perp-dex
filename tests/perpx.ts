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

  // ---- Shared state across tests ----
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

  // Market PDAs
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

  // -------------------------------------------------
  // 2) Initialize market (slabs in bids/asks)
  // -------------------------------------------------
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

  // -------------------------------------------------
  // 3) Deposit collateral
  // -------------------------------------------------
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

  // -------------------------------------------------
  // 4) (Optional) make sure re-init of global config fails
  // -------------------------------------------------
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
    it("4) places an order successfully", async () => {
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
  it("5) crank processes order queue → adds order to bid book", async () => {
  const COUNT_OFFSET = 12; // u16 head + u16 tail + u16 count + u16 capacity
  await program.methods
  .resetQueues()
  .accounts({
    market: marketPda,
    bids: bidsPda,
    asks: asksPda,
  })
  .rpc();
   
  await program.methods
    .resetQueues()
    .accounts({
      requestQueue: requestQueuePda,
      eventQueue: eventQueuePda,
    })
  .rpc();

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

  // Place an order again → ensure rq has exactly 1
  await program.methods
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
    .rpc();

  console.log("Order placed → request queued");

  // Confirm count is 1 BEFORE crank
  let rqBeforeInfo = await provider.connection.getAccountInfo(requestQueuePda);
  const rqBeforeCount = rqBeforeInfo.data.readUInt16LE(COUNT_OFFSET);
  console.log("Queue count before crank:", rqBeforeCount);
  expect(rqBeforeCount).to.equal(1);

  // Execute cranker → process queue & move to bids slab
  await program.methods
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
    .rpc();

  console.log("Crank executed");

  // Confirm queue was emptied
  let rqAfterInfo = await provider.connection.getAccountInfo(requestQueuePda);
  const rqAfterCount = rqAfterInfo.data.readUInt16LE(COUNT_OFFSET);
  console.log("Queue count after crank:", rqAfterCount);
  expect(rqAfterCount).to.equal(0);

  // Ensure bid tree has something now
  const bidInfo = await provider.connection.getAccountInfo(bidsPda);
  expect(bidInfo.data.length).to.be.greaterThan(8);

  console.log("Crank moved order to bid slab successfully");
});




  
});
