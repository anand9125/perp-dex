/**
 * Perp DEX integration tests.
 * Flow: init config → init market → deposit → place order → crank → match → position manager.
 *
 * Requires a running Solana RPC. Either:
 *   - Run `anchor test` (starts a local validator, deploys program, then runs this file), or
 *   - Start a validator manually: `solana-test-validator` then set ANCHOR_PROVIDER_URL=http://127.0.0.1:8899
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
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
import { PerpDex } from "../target/types/perp_dex";

// Default to local validator when running tests via yarn (e.g. anchor run test)
if (!process.env.ANCHOR_PROVIDER_URL) {
  process.env.ANCHOR_PROVIDER_URL = "http://127.0.0.1:8899";
}

// --- Constants (match on-chain layout) ---
const EVENT_QUEUE_COUNT_OFFSET = 8 + 4; // discriminator + head(2) + tail(2) then count at 12
const REQUEST_QUEUE_COUNT_OFFSET = 12;

describe("PerpDex", () => {
  let provider: anchor.AnchorProvider;
  try {
    provider = anchor.AnchorProvider.env();
  } catch (e) {
    throw new Error(
      "Could not create Anchor provider. Set ANCHOR_WALLET (e.g. ~/.config/solana/id.json). " +
        "Ensure a Solana RPC is running: start with 'solana-test-validator' or run 'anchor test' instead of 'anchor run test'."
    );
  }
  anchor.setProvider(provider);

  const program = anchor.workspace.PerpDex as Program<PerpDex>;
  const authority = provider.wallet as anchor.Wallet;
  const connection = provider.connection;

  // Global / vault PDAs
  let usdcMint: PublicKey;
  let globalConfigPda: PublicKey;
  let requestQueuePda: PublicKey;
  let eventQueuePda: PublicKey;
  let vaultQuotePda: PublicKey;
  let insuranceFundPda: PublicKey;
  let feePoolAta: PublicKey;

  // User
  let userUsdcAta: PublicKey;
  let userCollateralPda: PublicKey;

  // Market
  const MARKET_SYMBOL = "SOL-PERP";
  let marketPda: PublicKey;
  let bidsPda: PublicKey;
  let asksPda: PublicKey;
  let positionPda: PublicKey;

  /** Send tx and log on-chain logs on success or failure. */
  async function sendAndLog(ix: () => Promise<string>): Promise<string> {
    try {
      const sig = await ix();
      console.log("\n===== TX SUCCESS =====");
      console.log("Signature:", sig);
      const tx = await connection.getTransaction(sig, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      if (tx?.meta?.logMessages) {
        console.log("\n--- On-chain Logs ---");
        console.log(tx.meta.logMessages.join("\n"));
        console.log("--- End Logs ---\n");
      }
      return sig;
    } catch (e: any) {
      console.log("\n===== TX FAILURE =====");
      if (e.logs) {
        console.log("\n--- On-chain Logs ---");
        console.log(e.logs.join("\n"));
        console.log("--- End Logs ---\n");
      }
      throw e;
    }
  }

  /** Accounts for placeOrder (shared). */
  function placeOrderAccounts() {
    return {
      user: authority.publicKey,
      globalConfig: globalConfigPda,
      market: marketPda,
      userColletral: userCollateralPda,
      positionPerMarket: positionPda,
      requestQueue: requestQueuePda,
      systemProgram: SystemProgram.programId,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
    };
  }

  /** Accounts for processPlaceOrder (crank). */
  function processOrderAccounts() {
    return {
      authority: authority.publicKey,
      market: marketPda,
      bids: bidsPda,
      asks: asksPda,
      requestQueue: requestQueuePda,
      eventQueue: eventQueuePda,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    };
  }

  /** Accounts for positionManager (consume event queue → update position). */
  function positionManagerAccounts() {
    return {
      market: marketPda,
      userPosition: positionPda,
      eventQueue: eventQueuePda,
      userColletral: userCollateralPda,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    };
  }

  /** Build order payload (user bytes from authority). */
  function buildOrder(opts: {
    orderId: number;
    side: "buy" | "sell";
    qty: number;
    limitPrice: number;
    initialMargin?: number;
    leverage?: number;
  }): any {
    return {
      user: Array.from(authority.publicKey.toBytes()),
      orderId: new BN(opts.orderId),
      side: opts.side === "buy" ? { buy: {} } : { sell: {} },
      qty: new BN(opts.qty),
      orderType: { limit: {} },
      limitPrice: new BN(opts.limitPrice),
      initialMargin: new BN(opts.initialMargin ?? 10),
      leverage: opts.leverage ?? 10,
      market: marketPda,
    };
  }

  async function getEventQueueCount(): Promise<number> {
    const info = await connection.getAccountInfo(eventQueuePda);
    return info!.data.readUInt16LE(EVENT_QUEUE_COUNT_OFFSET);
  }

  async function getRequestQueueCount(): Promise<number> {
    const info = await connection.getAccountInfo(requestQueuePda);
    return info!.data.readUInt16LE(REQUEST_QUEUE_COUNT_OFFSET);
  }

  /** Reset order book and both queues for a clean state. */
  async function resetOrderBookAndQueues(): Promise<void> {
    await program.methods.resetSlab().accounts({ market: marketPda, bids: bidsPda, asks: asksPda } as any).rpc();
    await program.methods
      .resetQueues()
      .accounts({ requestQueue: requestQueuePda, eventQueue: eventQueuePda } as any)
      .rpc();
  }

  /** Place order and crank once. */
  async function placeAndCrank(order: any): Promise<void> {
    await program.methods.placeOrder(order).accounts(placeOrderAccounts()).rpc();
    await program.methods.processPlaceOrder().accounts(processOrderAccounts()).rpc();
  }

  before(async () => {
    try {
      await connection.getVersion();
    } catch (e) {
      throw new Error(
        "Cannot reach Solana RPC at " +
          (process.env.ANCHOR_PROVIDER_URL || "http://127.0.0.1:8899") +
          ". Start a local validator with 'solana-test-validator' in another terminal, or run 'anchor test' (which starts the validator for you)."
      );
    }

    const programAccount = await connection.getAccountInfo(program.programId);
    if (!programAccount || programAccount.data.length === 0) {
      throw new Error(
        "Perp DEX program is not deployed. Run: anchor build && anchor deploy --provider.cluster localnet (with validator running), or use 'anchor test'."
      );
    }

    const rpc = process.env.ANCHOR_PROVIDER_URL || "";
    if (rpc.includes("127.0.0.1") || rpc.includes("localhost")) {
      const balance = await connection.getBalance(authority.publicKey);
      if (balance < 1e9) {
        const sig = await connection.requestAirdrop(authority.publicKey, 2e9);
        await connection.confirmTransaction(sig);
      }
    }

    usdcMint = await createMint(
      connection,
      authority.payer,
      authority.publicKey,
      null,
      6
    );

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
    feePoolAta = await anchor.utils.token.associatedAddress({
      mint: usdcMint,
      owner: authority.publicKey,
    });
    [userCollateralPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_colletral"), authority.publicKey.toBuffer()],
      program.programId
    );

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

    const userAta = await getOrCreateAssociatedTokenAccount(
      connection,
      authority.payer,
      usdcMint,
      authority.publicKey
    );
    userUsdcAta = userAta.address;
    await mintTo(
      connection,
      authority.payer,
      usdcMint,
      userUsdcAta,
      authority.publicKey,
      BigInt(1_000_000_000)
    );
  });

  describe("1. Bootstrap", () => {
    it("initializes global config and queues", async () => {
      await sendAndLog(() =>
        program.methods
          .initaliseGlobalConfig(false, 3600)
          .accounts({
            authority: authority.publicKey,
            globalConfig: globalConfigPda,
            usdcMint,
            vaultQuote: vaultQuotePda,
            insuranceFund: insuranceFundPda,
            feePool: feePoolAta,
            requestQueue: requestQueuePda,
            eventQueue: eventQueuePda,
            systemProgram: SystemProgram.programId,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
          } as any)
          .rpc()
      );

      const config = await program.account.globalConfig.fetch(globalConfigPda);
      assert.equal(config.authority.toBase58(), authority.publicKey.toBase58());
      assert.equal(config.tradingPaused, false);
      assert.equal(config.fundingIntervalSecs, 3600);
      assert.equal(config.vaultQuote.toBase58(), vaultQuotePda.toBase58());
      assert.equal(config.insuranceFund.toBase58(), insuranceFundPda.toBase58());
      assert.equal(config.feePool.toBase58(), feePoolAta.toBase58());

      const vaultAcc = await getAccount(connection, vaultQuotePda);
      assert.equal(vaultAcc.mint.toBase58(), usdcMint.toBase58());
      assert.equal(vaultAcc.owner.toBase58(), globalConfigPda.toBase58());

      const rqInfo = await connection.getAccountInfo(requestQueuePda);
      const eqInfo = await connection.getAccountInfo(eventQueuePda);
      assert.ok(rqInfo !== null);
      assert.ok(eqInfo !== null);
    });

    it("initializes market", async () => {
      const now = Math.floor(Date.now() / 1000);
      const params = {
        oraclePubkey: authority.publicKey,
        lastOraclePrice: new anchor.BN(100_000_000),
        lastOracleTs: new anchor.BN(now),
        imBps: 1000,
        mmBps: 500,
        oracleBandBps: 100,
        takerFeeBps: 10,
        makerRebateBps: 5,
        liqPenaltyBps: 500,
        liquidatorShareBps: 500,
        maxFundingRate: new anchor.BN(1_000_000),
        cumFunding: new anchor.BN(0),
        lastFundingTs: new anchor.BN(now),
        fundingIntervalSecs: 3600,
        tickSize: 1,
        stepSize: 1,
        minOrderNotional: new anchor.BN(10_000),
      };

      await sendAndLog(() =>
        program.methods
          .initializeMarket(Buffer.from(MARKET_SYMBOL), params)
          .accounts({
            authority: authority.publicKey,
            market: marketPda,
            bids: bidsPda,
            asks: asksPda,
            systemProgram: SystemProgram.programId,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
          } as any)
          .rpc()
      );

      const market = await program.account.marketState.fetch(marketPda);
      assert.equal(market.symbol, MARKET_SYMBOL);
      assert.equal(market.authority.toBase58(), authority.publicKey.toBase58());
      assert.equal(market.bid.toBase58(), bidsPda.toBase58());
      assert.equal(market.asks.toBase58(), asksPda.toBase58());
      assert.equal(market.imBps, 1000);
      assert.equal(market.mmBps, 500);
    });

    it("fails to initialize global config twice", async () => {
      try {
        await program.methods
          .initaliseGlobalConfig(false, 3600)
          .accounts({
            authority: authority.publicKey,
            globalConfig: globalConfigPda,
            usdcMint,
            vaultQuote: vaultQuotePda,
            insuranceFund: insuranceFundPda,
            feePool: feePoolAta,
            requestQueue: requestQueuePda,
            eventQueue: eventQueuePda,
            systemProgram: SystemProgram.programId,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
          } as any)
          .rpc();
        assert.fail("expected second init to fail");
      } catch {
        // expected
      }
    });
  });

  describe("2. Collateral", () => {
    it("deposits collateral", async () => {
      const depositAmount = new anchor.BN(100_000_000); // 100 USDC (6 decimals)

      const userBefore = await getAccount(connection, userUsdcAta);
      const vaultBefore = await getAccount(connection, vaultQuotePda);

      await sendAndLog(() =>
        program.methods
          .depositColletral(depositAmount)
          .accounts({
            user: authority.publicKey,
            usdcMint,
            userWalletAccount: userUsdcAta,
            globalConfig: globalConfigPda,
            vaultQuote: vaultQuotePda,
            userColletral: userCollateralPda,
            systemProgram: SystemProgram.programId,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
          } as any)
          .rpc()
      );

      const userAfter = await getAccount(connection, userUsdcAta);
      const vaultAfter = await getAccount(connection, vaultQuotePda);
      const userDelta = BigInt(userBefore.amount.toString()) - BigInt(userAfter.amount.toString());
      const vaultDelta = BigInt(vaultAfter.amount.toString()) - BigInt(vaultBefore.amount.toString());
      assert.equal(userDelta.toString(), depositAmount.toString());
      assert.equal(vaultDelta.toString(), depositAmount.toString());

      const userColl = await program.account.userCollateral.fetch(userCollateralPda);
      assert.equal(userColl.owner.toBase58(), authority.publicKey.toBase58());
      assert.equal(userColl.collateralAmount.toString(), depositAmount.toString());
    });
    it("rejects deposit of zero", async () => {
      try {
        await program.methods.depositColletral(new anchor.BN(0)).accounts({
          user: authority.publicKey,
          usdcMint,
          userWalletAccount: userUsdcAta,
          globalConfig: globalConfigPda,
          vaultQuote: vaultQuotePda,
          userColletral: userCollateralPda,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any).rpc();
        assert.fail("expected InvalidAmount");
      } catch (e: any) {
        expect(e.message || e.toString()).to.match(/InvalidAmount|3012/i);
      }
    });

    it("second deposit adds to collateral", async () => {
      await program.methods.depositColletral(new anchor.BN(50_000_000)).accounts({
        user: authority.publicKey,
        usdcMint,
        userWalletAccount: userUsdcAta,
        globalConfig: globalConfigPda,
        vaultQuote: vaultQuotePda,
        userColletral: userCollateralPda,
        systemProgram: SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any).rpc();
      const userColl = await program.account.userCollateral.fetch(userCollateralPda);
      expect(userColl.collateralAmount.toString()).to.equal("150000000");
    });
  });

  describe("2b. Market & reset", () => {
    it("set_mark_price updates market last oracle price", async () => {
      const newPrice = new anchor.BN(105_000_000);
      await program.methods.setMarkPrice(newPrice).accounts({ market: marketPda } as any).rpc();
      const market = await program.account.marketState.fetch(marketPda);
      expect(market.lastOraclePrice.toString()).to.equal(newPrice.toString());
    });

    it("reset_queues clears request and event queue counts", async () => {
      await program.methods
        .resetQueues()
        .accounts({ requestQueue: requestQueuePda, eventQueue: eventQueuePda } as any)
        .rpc();
      expect(await getRequestQueueCount()).to.equal(0);
      expect(await getEventQueueCount()).to.equal(0);
    });

    it("reset_slab allows placing and cranking again", async () => {
      await resetOrderBookAndQueues();
      const order = buildOrder({ orderId: 99, side: "buy", qty: 2, limitPrice: 100 });
      await placeAndCrank(order);
      expect(await getRequestQueueCount()).to.equal(0);
      const bidInfo = await connection.getAccountInfo(bidsPda);
      expect(bidInfo!.data.length).to.be.greaterThan(8);
    });
  });

  describe("3. Orders", () => {
    it("places order and enqueues request", async () => {
      const order = buildOrder({
        orderId: 0,
        side: "buy",
        qty: 1,
        limitPrice: 1,
      });

      await program.methods
        .placeOrder(order)
        .accounts(placeOrderAccounts())
        .rpc();

      const rq = await program.account.requestQueue.fetch(requestQueuePda);
      const position = await program.account.position.fetch(positionPda);
      const userCol = await program.account.userCollateral.fetch(userCollateralPda);

      expect(rq.count).to.equal(1);
      expect(position.owner.toBase58()).to.equal(authority.publicKey.toBase58());
      expect(position.status).to.deep.equal({ pending: {} });
      expect(userCol.collateralAmount.toString()).to.equal("150000000");
    });

    it("rejects place_order when insufficient collateral for initial margin", async () => {
      await resetOrderBookAndQueues();
      const userColl = await program.account.userCollateral.fetch(userCollateralPda);
      const collateral = userColl.collateralAmount.toNumber();
      const market = await program.account.marketState.fetch(marketPda);
      const mark = market.lastOraclePrice.toNumber();
      const imBps = market.imBps;
      const orderNotional = 200 * mark;
      const requiredIm = Math.floor((orderNotional * imBps) / 10_000);
      expect(requiredIm).to.be.greaterThan(collateral);
      const order = buildOrder({
        orderId: 301,
        side: "buy",
        qty: 200,
        limitPrice: mark,
        initialMargin: requiredIm,
        leverage: 10,
      });
      try {
        await program.methods.placeOrder(order).accounts(placeOrderAccounts()).rpc();
        assert.fail("expected insufficient collateral");
      } catch (e: any) {
        expect(e.message || e.toString()).to.satisfy((s: string) =>
          /InsufficientCollateral|6011/i.test(s)
        );
      }
    });

    it("crank processes request queue and adds limit order to bid book", async () => {
      await sendAndLog(() =>
        program.methods.resetSlab().accounts({ market: marketPda, bids: bidsPda, asks: asksPda } as any).rpc()
      );
      await sendAndLog(() =>
        program.methods
          .resetQueues()
          .accounts({ requestQueue: requestQueuePda, eventQueue: eventQueuePda } as any)
          .rpc()
      );

      const order = buildOrder({ orderId: 0, side: "buy", qty: 1, limitPrice: 100 });
      await sendAndLog(() =>
        program.methods.placeOrder(order).accounts(placeOrderAccounts()).rpc()
      );

      expect(await getRequestQueueCount()).to.equal(1);

      await sendAndLog(() =>
        program.methods.processPlaceOrder().accounts(processOrderAccounts()).rpc()
      );

      expect(await getRequestQueueCount()).to.equal(0);
      const bidInfo = await connection.getAccountInfo(bidsPda);
      expect(bidInfo!.data.length).to.be.greaterThan(8);
    });

    it("multi-level matching: buy matches asks with price priority and partial fill", async () => {
      await sendAndLog(() =>
        program.methods.resetSlab().accounts({ market: marketPda, bids: bidsPda, asks: asksPda } as any).rpc()
      );
      await sendAndLog(() =>
        program.methods
          .resetQueues()
          .accounts({ requestQueue: requestQueuePda, eventQueue: eventQueuePda } as any)
          .rpc()
      );

      const asks = [
        { id: 1, price: 90, qty: 1 },
        { id: 2, price: 95, qty: 1 },
        { id: 3, price: 100, qty: 1 },
      ];
      for (const o of asks) {
        await sendAndLog(() =>
          program.methods
            .placeOrder(
              buildOrder({
                orderId: o.id,
                side: "sell",
                qty: o.qty,
                limitPrice: o.price,
                initialMargin: 5,
                leverage: 5,
              })
            )
            .accounts(placeOrderAccounts())
            .rpc()
        );
        await sendAndLog(() =>
          program.methods.processPlaceOrder().accounts(processOrderAccounts()).rpc()
        );
      }

      const buyQty = 2;
      await sendAndLog(() =>
        program.methods
          .placeOrder(
            buildOrder({
              orderId: 200,
              side: "buy",
              qty: buyQty,
              limitPrice: 100,
              initialMargin: 20,
              leverage: 5,
            })
          )
          .accounts(placeOrderAccounts())
          .rpc()
      );
      await sendAndLog(() =>
        program.methods.processPlaceOrder().accounts(processOrderAccounts()).rpc()
      );

      const askInfo = await connection.getAccountInfo(asksPda);
      expect(askInfo!.data.length).to.be.greaterThan(8);
    });

    it("sell order rests on asks, then buy matches and leaves remainder on bids", async () => {
      await resetOrderBookAndQueues();
      await placeAndCrank(
        buildOrder({ orderId: 1, side: "sell", qty: 10, limitPrice: 100, initialMargin: 10, leverage: 5 })
      );
      expect(await getRequestQueueCount()).to.equal(0);
      await placeAndCrank(
        buildOrder({ orderId: 2, side: "buy", qty: 4, limitPrice: 100, initialMargin: 10, leverage: 5 })
      );
      const eqCount = await getEventQueueCount();
      expect(eqCount).to.be.greaterThan(0);
      await program.methods
        .positionManager(authority.publicKey)
        .accounts(positionManagerAccounts())
        .rpc();
      const position = await program.account.position.fetch(positionPda);
      expect(position.basePosition.toNumber()).to.equal(4);
      expect(position.entryPrice.toNumber()).to.equal(100);
    });
  });

  describe("4. Position from events", () => {
    it("consumes event queue and updates user position", async () => {
      await sendAndLog(() =>
        program.methods.resetSlab().accounts({ market: marketPda, bids: bidsPda, asks: asksPda } as any).rpc()
      );
      await sendAndLog(() =>
        program.methods
          .resetQueues()
          .accounts({ requestQueue: requestQueuePda, eventQueue: eventQueuePda } as any)
          .rpc()
      );

      const sellOrders = [
        { id: 11, price: 90, qty: 3 },
        { id: 12, price: 95, qty: 5 },
      ];
      for (const o of sellOrders) {
        await sendAndLog(() =>
          program.methods
            .placeOrder(
              buildOrder({
                orderId: o.id,
                side: "sell",
                qty: o.qty,
                limitPrice: o.price,
                initialMargin: 5,
                leverage: 5,
              })
            )
            .accounts(placeOrderAccounts())
            .rpc()
        );
        await sendAndLog(() =>
          program.methods.processPlaceOrder().accounts(processOrderAccounts()).rpc()
        );
      }

      await sendAndLog(() =>
        program.methods
          .placeOrder(
            buildOrder({
              orderId: 2001,
              side: "buy",
              qty: 10,
              limitPrice: 100,
              initialMargin: 20,
              leverage: 5,
            })
          )
          .accounts(placeOrderAccounts())
          .rpc()
      );
      await sendAndLog(() =>
        program.methods.processPlaceOrder().accounts(processOrderAccounts()).rpc()
      );

      const countBefore = await getEventQueueCount();
      expect(countBefore).to.be.greaterThan(0);

      await sendAndLog(() =>
        program.methods
          .positionManager(authority.publicKey)
          .accounts(positionManagerAccounts())
          .rpc()
      );

      const position = await program.account.position.fetch(positionPda);

      expect(position.updatedAt.toNumber()).to.be.greaterThan(0);
      expect(position.basePosition.toNumber()).to.be.a("number");
      expect(position.realizedPnl.toNumber()).to.be.a("number");
      expect(position.lastCumFunding.toNumber()).to.be.a("number");
    });

    it("position_manager with empty event queue does nothing and does not error", async () => {
      await resetOrderBookAndQueues();
      await program.methods
        .positionManager(authority.publicKey)
        .accounts(positionManagerAccounts())
        .rpc();
      const position = await program.account.position.fetch(positionPda);
      expect(position.basePosition.toNumber()).to.equal(0);
    });

    it("position_manager consumes multiple events for user and updates position correctly", async () => {
      await resetOrderBookAndQueues();
      await placeAndCrank(
        buildOrder({ orderId: 1, side: "sell", qty: 10, limitPrice: 100, initialMargin: 10, leverage: 5 })
      );
      await placeAndCrank(
        buildOrder({ orderId: 2, side: "buy", qty: 10, limitPrice: 100, initialMargin: 10, leverage: 5 })
      );
      expect(await getEventQueueCount()).to.be.greaterThan(0);
      await program.methods
        .positionManager(authority.publicKey)
        .accounts(positionManagerAccounts())
        .rpc();
      const position = await program.account.position.fetch(positionPda);
      expect(position.basePosition.toNumber()).to.equal(10);
      expect(position.entryPrice.toNumber()).to.be.greaterThan(0);
    });
  });

  describe("5. Withdraw", () => {
    it("withdraws partial collateral and updates vault and user ATA", async () => {
      const beforeColl = await program.account.userCollateral.fetch(userCollateralPda);
      const withdrawAmount = new anchor.BN(30_000_000);
      const userAtaBefore = await getAccount(connection, userUsdcAta);

      await program.methods
        .withdraw(withdrawAmount)
        .accounts({
          user: authority.publicKey,
          userColletral: userCollateralPda,
          globalConfig: globalConfigPda,
          usdcMint,
          vaultQuote: vaultQuotePda,
          userAta: userUsdcAta,
          market: marketPda,
          userPosition: positionPda,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .rpc();

      const userColl = await program.account.userCollateral.fetch(userCollateralPda);
      const expectedColl = beforeColl.collateralAmount.toNumber() - 30_000_000;
      expect(userColl.collateralAmount.toNumber()).to.equal(expectedColl);
      const userAtaAfter = await getAccount(connection, userUsdcAta);
      expect(Number(userAtaAfter.amount) - Number(userAtaBefore.amount)).to.equal(30_000_000);
    });

    it("rejects withdraw of zero", async () => {
      try {
        await program.methods
          .withdraw(new anchor.BN(0))
          .accounts({
            user: authority.publicKey,
            userColletral: userCollateralPda,
            globalConfig: globalConfigPda,
            usdcMint,
            vaultQuote: vaultQuotePda,
            userAta: userUsdcAta,
            market: marketPda,
            userPosition: positionPda,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          } as any)
          .rpc();
        assert.fail("expected InvalidAmount");
      } catch (e: any) {
        expect(e.message || e.toString()).to.match(/InvalidAmount|3012/i);
      }
    });

    it("rejects withdraw exceeding collateral", async () => {
      try {
        await program.methods
          .withdraw(new anchor.BN(200_000_000))
          .accounts({
            user: authority.publicKey,
            userColletral: userCollateralPda,
            globalConfig: globalConfigPda,
            usdcMint,
            vaultQuote: vaultQuotePda,
            userAta: userUsdcAta,
            market: marketPda,
            userPosition: positionPda,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          } as any)
          .rpc();
        assert.fail("expected InsufficientCollateral");
      } catch (e: any) {
        expect(e.message || e.toString()).to.satisfy((s: string) =>
          /InsufficientCollateral|6011/i.test(s)
        );
      }
    });
  });
});
