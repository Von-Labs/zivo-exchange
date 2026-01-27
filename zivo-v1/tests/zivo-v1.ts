import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import fs from "fs";
import path from "path";
import {
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SendTransactionError,
} from "@solana/web3.js";
import { encryptValue } from "@inco/solana-sdk/encryption";
import { hexToBuffer } from "@inco/solana-sdk/utils";

import type { ZivoOrderbookProgram } from "../target/types/zivo_orderbook_program";

const INCO_LIGHTNING_PROGRAM_ID = new PublicKey(
  "5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj",
);
const INCO_TOKEN_PROGRAM_ID = new PublicKey(
  "4cyJHzecVWuU2xux6bCAPAhALKQT8woBh4Vx3AGEGe5N",
);

const KEY_DIR = path.resolve("tests", "keys");

function loadOrCreateKeypair(name: string): Keypair {
  fs.mkdirSync(KEY_DIR, { recursive: true });
  const filePath = path.join(KEY_DIR, `${name}.json`);
  if (fs.existsSync(filePath)) {
    const secret = JSON.parse(fs.readFileSync(filePath, "utf8")) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(secret));
  }
  const kp = Keypair.generate();
  fs.writeFileSync(filePath, JSON.stringify(Array.from(kp.secretKey)));
  return kp;
}

async function ensureSol(
  provider: anchor.AnchorProvider,
  pubkey: PublicKey,
  minLamports: number,
): Promise<void> {
  const current = await provider.connection.getBalance(pubkey);
  if (current >= minLamports) return;
  throw new Error(
    `insufficient SOL for ${pubkey.toBase58()}: have ${current}, need ${
      minLamports / LAMPORTS_PER_SOL
    }`,
  );
}

function buildIncoIdl(): anchor.Idl {
  return {
    version: "0.1.0",
    name: "inco_token",
    address: INCO_TOKEN_PROGRAM_ID.toString(),
    instructions: [
      {
        name: "initialize_mint",
        discriminator: [209, 42, 195, 4, 129, 85, 209, 44],
        accounts: [
          { name: "mint", writable: true, signer: true },
          { name: "payer", writable: true, signer: true },
          {
            name: "system_program",
            address: "11111111111111111111111111111111",
          },
          {
            name: "inco_lightning_program",
            address: INCO_LIGHTNING_PROGRAM_ID.toString(),
          },
        ],
        args: [
          { name: "decimals", type: "u8" },
          { name: "mint_authority", type: "pubkey" },
          { name: "freeze_authority", type: { option: "pubkey" } },
        ],
      },
      {
        name: "initialize_account",
        discriminator: [74, 115, 99, 93, 197, 69, 103, 7],
        accounts: [
          { name: "account", writable: true, signer: true },
          { name: "mint" },
          { name: "owner" },
          { name: "payer", writable: true, signer: true },
          {
            name: "system_program",
            address: "11111111111111111111111111111111",
          },
          {
            name: "inco_lightning_program",
            address: INCO_LIGHTNING_PROGRAM_ID.toString(),
          },
        ],
        args: [],
      },
      {
        name: "mint_to",
        discriminator: [241, 34, 48, 186, 37, 179, 123, 192],
        accounts: [
          { name: "mint", writable: true },
          { name: "account", writable: true },
          { name: "mint_authority", writable: true, signer: true },
          {
            name: "inco_lightning_program",
            address: INCO_LIGHTNING_PROGRAM_ID.toString(),
          },
          {
            name: "system_program",
            address: "11111111111111111111111111111111",
          },
        ],
        args: [
          { name: "ciphertext", type: "bytes" },
          { name: "input_type", type: "u8" },
        ],
      },
    ],
    accounts: [],
    types: [],
  } as anchor.Idl;
}

async function encryptAmount(
  amount: bigint,
): Promise<{ ciphertext: Buffer; inputType: number }> {
  const encryptedHex = await encryptValue(amount);
  return { ciphertext: hexToBuffer(encryptedHex), inputType: 0 };
}

describe("zivo-v1 orderbook", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .ZivoOrderbookProgram as anchor.Program<ZivoOrderbookProgram>;
  const incoProgram = new anchor.Program(buildIncoIdl(), provider);

  let statePda: PublicKey;
  let incoVaultAuthority: PublicKey;

  let payer: Keypair;
  let buyer1: Keypair;
  let buyer2: Keypair;
  let seller1: Keypair;
  let seller2: Keypair;

  let baseMint: Keypair;
  let quoteMint: Keypair;
  let baseVault: Keypair;
  let quoteVault: Keypair;

  let buyer1Base: Keypair;
  let buyer1Quote: Keypair;
  let buyer2Base: Keypair;
  let buyer2Quote: Keypair;
  let seller1Base: Keypair;
  let seller1Quote: Keypair;
  let seller2Base: Keypair;
  let seller2Quote: Keypair;

  const baseDecimals = 6;
  const quoteDecimals = 9;
  const tradeBaseAmount = 1_000_000n; // 1 base token
  const tradeQuoteAmount = 100_000_000n; // 0.1 quote token
  const topUpBase = 2_000_000n; // extra base to top-up each run
  const topUpQuote = 2_000_000_000n; // extra quote to top-up each run

  const explorerBase = "https://explorer.solana.com/tx/";
  // Bump suffix when seeds change to force fresh keypairs/accounts.
  const KEY_SUFFIX = "v17";
  const keyName = (name: string) => `${name}_${KEY_SUFFIX}`;

  async function initializeIncoMint(
    mint: Keypair,
    decimals: number,
  ): Promise<void> {
    await incoProgram.methods
      .initializeMint(decimals, payer.publicKey, payer.publicKey)
      .accounts({
        mint: mint.publicKey,
        payer: payer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
      })
      .signers([mint, payer])
      .rpc();
  }

  async function initializeIncoAccount(
    account: Keypair,
    mint: PublicKey,
    owner: PublicKey,
  ): Promise<void> {
    await incoProgram.methods
      .initializeAccount()
      .accounts({
        account: account.publicKey,
        mint,
        owner,
        payer: payer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
      })
      .signers([account, payer])
      .rpc();
  }

  async function topUpIncoAccount(
    account: PublicKey,
    mint: PublicKey,
    amount: bigint,
  ): Promise<void> {
    const { ciphertext, inputType } = await encryptAmount(amount);
    await incoProgram.methods
      .mintTo(ciphertext, inputType)
      .accounts({
        mint,
        account,
        mintAuthority: payer.publicKey,
        incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([payer])
      .rpc();
  }

  async function mintToInco(
    mint: PublicKey,
    account: PublicKey,
    amount: bigint,
  ): Promise<void> {
    const { ciphertext, inputType } = await encryptAmount(amount);
    await incoProgram.methods
      .mintTo(ciphertext, inputType)
      .accounts({
        mint,
        account,
        mintAuthority: payer.publicKey,
        incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([payer])
      .rpc();
  }

  function depositPda(state: PublicKey, user: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("deposit_v9"), state.toBuffer(), user.toBuffer()],
      program.programId,
    )[0];
  }

  function orderPda(
    state: PublicKey,
    owner: PublicKey,
    seq: BN,
  ): PublicKey {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("order_v1"),
        state.toBuffer(),
        owner.toBuffer(),
        Buffer.from(seq.toArray("le", 8)),
      ],
      program.programId,
    )[0];
  }

  type OrderMeta = {
    side: number;
    price: number;
    seq: BN;
    order: PublicKey;
    owner: PublicKey;
  };

  function selectMaker(orders: OrderMeta[], side: number): OrderMeta {
    const filtered = orders.filter((o) => o.side === side);
    if (filtered.length === 0) {
      throw new Error("no orders for side");
    }
    return filtered.sort((a, b) => {
      if (a.price !== b.price) {
        return side === 1 ? a.price - b.price : b.price - a.price;
      }
      return a.seq.cmp(b.seq);
    })[0];
  }

  async function sendTx(
    label: string,
    method: any,
    signers: Keypair[],
    useComputeBudget = false,
  ): Promise<string> {
    try {
      const builder = useComputeBudget
        ? method.preInstructions([
            ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
          ])
        : method;
      const sig = await builder.signers(signers).rpc();
      console.log(`${label}.tx: ${explorerBase}${sig}?cluster=devnet`);
      return sig;
    } catch (err) {
      if (err instanceof SendTransactionError) {
        console.log(`${label}.error.logs:`, err.logs ?? []);
      }
      throw err;
    }
  }

  before(async () => {
    const incoProgramAccount = await provider.connection.getAccountInfo(
      INCO_TOKEN_PROGRAM_ID,
    );
    if (!incoProgramAccount) {
      throw new Error(
        `inco-token program ${INCO_TOKEN_PROGRAM_ID.toBase58()} not found on devnet. Deploy it first.`,
      );
    }

    payer = (provider.wallet as any).payer as Keypair;
    buyer1 = loadOrCreateKeypair("buyer_1");
    buyer2 = loadOrCreateKeypair("buyer_2");
    seller1 = loadOrCreateKeypair("seller_1");
    seller2 = loadOrCreateKeypair("seller_2");

    await ensureSol(provider, payer.publicKey, 2_000_000_000);
    await ensureSol(provider, buyer1.publicKey, 200_000_000);
    await ensureSol(provider, buyer2.publicKey, 200_000_000);
    await ensureSol(provider, seller1.publicKey, 200_000_000);
    await ensureSol(provider, seller2.publicKey, 200_000_000);

    baseMint = loadOrCreateKeypair(keyName("base_mint"));
    quoteMint = loadOrCreateKeypair(keyName("quote_mint"));
    baseVault = loadOrCreateKeypair(keyName("base_vault"));
    quoteVault = loadOrCreateKeypair(keyName("quote_vault"));

    [statePda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("orderbook_market_v1"),
        baseMint.publicKey.toBuffer(),
        quoteMint.publicKey.toBuffer(),
      ],
      program.programId,
    );
    [incoVaultAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("inco_vault_authority_v12"), statePda.toBuffer()],
      program.programId,
    );

    buyer1Base = loadOrCreateKeypair(keyName("buyer1_base"));
    buyer1Quote = loadOrCreateKeypair(keyName("buyer1_quote"));
    buyer2Base = loadOrCreateKeypair(keyName("buyer2_base"));
    buyer2Quote = loadOrCreateKeypair(keyName("buyer2_quote"));
    seller1Base = loadOrCreateKeypair(keyName("seller1_base"));
    seller1Quote = loadOrCreateKeypair(keyName("seller1_quote"));
    seller2Base = loadOrCreateKeypair(keyName("seller2_base"));
    seller2Quote = loadOrCreateKeypair(keyName("seller2_quote"));
  });

  it("initializes Inco mints/accounts, vaults, and deposits", async () => {
    const stateInfo = await provider.connection.getAccountInfo(statePda);
    if (stateInfo) {
      if (stateInfo.owner && !stateInfo.owner.equals(program.programId)) {
        throw new Error(
          `orderbook state PDA is owned by ${stateInfo.owner.toBase58()}, expected ${program.programId.toBase58()}`,
        );
      }
      if (stateInfo.data.length === 0) {
        throw new Error(
          "orderbook state PDA exists but has no data; use a fresh program id or close the account",
        );
      }
      const existing = await program.account.orderbookState.fetch(statePda);
      if (
        !existing.incoBaseMint.equals(baseMint.publicKey) ||
        !existing.incoQuoteMint.equals(quoteMint.publicKey) ||
        !existing.incoBaseVault.equals(baseVault.publicKey) ||
        !existing.incoQuoteVault.equals(quoteVault.publicKey)
      ) {
        throw new Error(
          "orderbook state already exists with different mints/vaults; update test keys or deploy a fresh program id",
        );
      }
    }

    const ensureIncoMint = async (mint: Keypair, decimals: number) => {
      const info = await provider.connection.getAccountInfo(mint.publicKey);
      if (info) return;
      await initializeIncoMint(mint, decimals);
    };

    const ensureIncoAccount = async (
      account: Keypair,
      mint: PublicKey,
      owner: PublicKey,
    ) => {
      const info = await provider.connection.getAccountInfo(account.publicKey);
      if (info) return;
      await initializeIncoAccount(account, mint, owner);
    };

    await ensureIncoMint(baseMint, baseDecimals);
    await ensureIncoMint(quoteMint, quoteDecimals);

    await ensureIncoAccount(baseVault, baseMint.publicKey, incoVaultAuthority);
    await ensureIncoAccount(
      quoteVault,
      quoteMint.publicKey,
      incoVaultAuthority,
    );

    for (const acct of [
      buyer1Base,
      buyer1Quote,
      buyer2Base,
      buyer2Quote,
      seller1Base,
      seller1Quote,
      seller2Base,
      seller2Quote,
    ]) {
      const mint =
        acct === buyer1Base ||
        acct === buyer2Base ||
        acct === seller1Base ||
        acct === seller2Base
          ? baseMint.publicKey
          : quoteMint.publicKey;
      const owner =
        acct === buyer1Base || acct === buyer1Quote
          ? buyer1.publicKey
          : acct === buyer2Base || acct === buyer2Quote
          ? buyer2.publicKey
          : acct === seller1Base || acct === seller1Quote
          ? seller1.publicKey
          : seller2.publicKey;
      await ensureIncoAccount(acct, mint, owner);
    }

    await mintToInco(
      quoteMint.publicKey,
      buyer1Quote.publicKey,
      3_000_000_000n,
    );
    await mintToInco(
      quoteMint.publicKey,
      buyer2Quote.publicKey,
      3_000_000_000n,
    );
    await mintToInco(baseMint.publicKey, seller1Base.publicKey, 5_000_000n);
    await mintToInco(baseMint.publicKey, seller2Base.publicKey, 5_000_000n);

    if (!stateInfo) {
      const initTx = await program.methods
        .initialize(false)
        .accounts({
          state: statePda,
          incoVaultAuthority,
          incoBaseVault: baseVault.publicKey,
          incoQuoteVault: quoteVault.publicKey,
          incoBaseMint: baseMint.publicKey,
          incoQuoteMint: quoteMint.publicKey,
          admin: payer.publicKey,
          payer: payer.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          incoTokenProgram: INCO_TOKEN_PROGRAM_ID,
        })
        .signers([payer])
        .rpc();
      console.log("initialize.tx:", `${explorerBase}${initTx}?cluster=devnet`);
    } else {
      console.log("initialize: state already exists, skipping init");
    }

    for (const user of [buyer1, buyer2, seller1, seller2]) {
      const baseAcct =
        user === buyer1
          ? buyer1Base
          : user === buyer2
          ? buyer2Base
          : user === seller1
          ? seller1Base
          : seller2Base;
      const quoteAcct =
        user === buyer1
          ? buyer1Quote
          : user === buyer2
          ? buyer2Quote
          : user === seller1
          ? seller1Quote
          : seller2Quote;

      const depositAddress = depositPda(statePda, user.publicKey);
      const depositInfo = await provider.connection.getAccountInfo(
        depositAddress,
      );
      if (depositInfo) {
        if (!depositInfo.owner.equals(program.programId)) {
          console.log(
            `initialize_deposit: ${depositAddress.toBase58()} owned by ${depositInfo.owner.toBase58()}, skipping init`,
          );
        } else {
          console.log(
            `initialize_deposit: ${depositAddress.toBase58()} already exists, skipping init`,
          );
        }
        continue;
      }

      await program.methods
        .initializeDeposit()
        .accounts({
          payer: payer.publicKey,
          user: user.publicKey,
          state: statePda,
          deposit: depositAddress,
          userBaseInco: baseAcct.publicKey,
          userQuoteInco: quoteAcct.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([payer, user])
        .rpc();
    }
  });

  it("places orders and matches (partial-fill ready)", async () => {
    const stateInfo = await provider.connection.getAccountInfo(statePda);
    if (!stateInfo) {
      console.log("place/settle: state PDA missing; run initialize test first");
      return;
    }
    if (!stateInfo.owner.equals(program.programId)) {
      console.log(
        `place/settle: state owned by ${stateInfo.owner.toBase58()}; skip or redeploy with program-owned state`,
      );
      return;
    }

    // Reset state before running the flow (idempotent between runs)
    await sendTx(
      "reset_state",
      program.methods.resetState().accounts({
        state: statePda,
        admin: payer.publicKey,
      }),
      [payer],
    );
    const price = new BN(100);
    const sizeCipher = await encryptAmount(tradeBaseAmount);
    const quoteEscrow = await encryptAmount(tradeQuoteAmount);
    const baseEscrow = await encryptAmount(tradeBaseAmount);

    // Top-up balances every run so retries are stable
    await topUpIncoAccount(
      buyer1Quote.publicKey,
      quoteMint.publicKey,
      topUpQuote,
    );
    await topUpIncoAccount(
      seller1Base.publicKey,
      baseMint.publicKey,
      topUpBase,
    );

    console.log(
      "place bid/ask inputs",
      JSON.stringify(
        {
          buyer: buyer1.publicKey.toBase58(),
          seller: seller1.publicKey.toBase58(),
          price: price.toNumber(),
          qty: "1 base (encrypted)",
          bidEscrowQuoteUi: Number(tradeQuoteAmount) / 10 ** quoteDecimals,
          askEscrowBaseUi: Number(tradeBaseAmount) / 10 ** baseDecimals,
          sizeCipherBytes: sizeCipher.ciphertext.length,
        },
        null,
        2,
      ),
    );

    const orderMetas: OrderMeta[] = [];
    const bidSeq = new BN(
      (await program.account.orderbookState.fetch(statePda)).orderSeq.toString(),
    );
    const bidOrder = orderPda(statePda, buyer1.publicKey, bidSeq);

    await sendTx(
      "place_bid",
      program.methods
        .placeOrder(
          0,
          price,
          sizeCipher.ciphertext,
          sizeCipher.inputType,
          quoteEscrow.ciphertext,
          quoteEscrow.inputType,
        )
        .accounts({
          state: statePda,
          order: bidOrder,
          trader: buyer1.publicKey,
          incoVaultAuthority,
          incoBaseVault: baseVault.publicKey,
          incoQuoteVault: quoteVault.publicKey,
          traderBaseInco: buyer1Base.publicKey,
          traderQuoteInco: buyer1Quote.publicKey,
          incoBaseMint: baseMint.publicKey,
          incoQuoteMint: quoteMint.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          incoTokenProgram: INCO_TOKEN_PROGRAM_ID,
          incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
        }),
      [buyer1],
    );
    orderMetas.push({
      side: 0,
      price: price.toNumber(),
      seq: bidSeq,
      order: bidOrder,
      owner: buyer1.publicKey,
    });
    console.log(
      `buyer ${buyer1.publicKey.toBase58()} placed bid: buy ${
        Number(tradeBaseAmount) / 10 ** baseDecimals
      } base @ price 100; escrowed ${
        Number(tradeQuoteAmount) / 10 ** quoteDecimals
      } quote`,
    );

    const askSeq = new BN(
      (await program.account.orderbookState.fetch(statePda)).orderSeq.toString(),
    );
    const askOrder = orderPda(statePda, seller1.publicKey, askSeq);

    await sendTx(
      "place_ask",
      program.methods
        .placeOrder(
          1,
          price,
          sizeCipher.ciphertext,
          sizeCipher.inputType,
          baseEscrow.ciphertext,
          baseEscrow.inputType,
        )
        .accounts({
          state: statePda,
          order: askOrder,
          trader: seller1.publicKey,
          incoVaultAuthority,
          incoBaseVault: baseVault.publicKey,
          incoQuoteVault: quoteVault.publicKey,
          traderBaseInco: seller1Base.publicKey,
          traderQuoteInco: seller1Quote.publicKey,
          incoBaseMint: baseMint.publicKey,
          incoQuoteMint: quoteMint.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          incoTokenProgram: INCO_TOKEN_PROGRAM_ID,
          incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
        }),
      [seller1],
    );
    orderMetas.push({
      side: 1,
      price: price.toNumber(),
      seq: askSeq,
      order: askOrder,
      owner: seller1.publicKey,
    });
    console.log(
      `seller ${seller1.publicKey.toBase58()} placed ask: sell ${
        Number(tradeBaseAmount) / 10 ** baseDecimals
      } base @ price 100; escrowed ${
        Number(tradeBaseAmount) / 10 ** baseDecimals
      } base`,
    );

    const maker = selectMaker(orderMetas, 1);
    const takerSide = maker.side === 1 ? 0 : 1;

    await sendTx(
      "match_order",
      program.methods
        .matchOrder(
          takerSide,
          new BN(maker.price),
          sizeCipher.ciphertext,
          sizeCipher.ciphertext,
          quoteEscrow.ciphertext,
          sizeCipher.inputType,
        )
        .accounts({
          state: statePda,
          makerOrder: maker.order,
          owner: maker.owner,
          matcher: payer.publicKey,
          taker: buyer1.publicKey,
          incoVaultAuthority,
          incoBaseVault: baseVault.publicKey,
          incoQuoteVault: quoteVault.publicKey,
          makerBaseInco: seller1Base.publicKey,
          makerQuoteInco: seller1Quote.publicKey,
          takerBaseInco: buyer1Base.publicKey,
          takerQuoteInco: buyer1Quote.publicKey,
          incoBaseMint: baseMint.publicKey,
          incoQuoteMint: quoteMint.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          incoTokenProgram: INCO_TOKEN_PROGRAM_ID,
          incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
          instructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        }),
      [payer, buyer1],
      true,
    );
    console.log(
      `matched: buyer ${buyer1.publicKey.toBase58()} vs seller ${seller1.publicKey.toBase58()} for ${
        Number(tradeBaseAmount) / 10 ** baseDecimals
      } base`,
    );
  });
});
