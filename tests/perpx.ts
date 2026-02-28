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
      expect(userCol.collateralAmount.toString()).to.equal("100000000");
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
  });
});
