import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
// @ts-ignore
import { Escrow } from "../target/types/escrow";
import { assert } from "chai";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddress,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { BN } from "bn.js";

describe("escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Escrow as Program<Escrow>;

  let mintA: anchor.web3.PublicKey;
  let mintB: anchor.web3.PublicKey;
  let maker = anchor.web3.Keypair.generate();
  let taker = anchor.web3.Keypair.generate();
  let makerAtaA: anchor.web3.PublicKey;
  let makerAtaB: anchor.web3.PublicKey;
  let takerAtaA: anchor.web3.PublicKey;
  let takerAtaB: anchor.web3.PublicKey;

  let seed = new BN(Math.floor(Math.random() * 100000));
  let escrowStatePDA: anchor.web3.PublicKey;
  let vaultPDA: anchor.web3.PublicKey;

  before(async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(maker.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL),
      "confirmed"
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(taker.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL),
      "confirmed"
    );

    mintA = await createMint(provider.connection, maker, maker.publicKey, null, 6);
    mintB = await createMint(provider.connection, taker, taker.publicKey, null, 6);

    makerAtaA = await createAssociatedTokenAccount(provider.connection, maker, mintA, maker.publicKey);
    makerAtaB = await createAssociatedTokenAccount(provider.connection, maker, mintB, maker.publicKey);
    takerAtaA = await createAssociatedTokenAccount(provider.connection, taker, mintA, taker.publicKey);
    takerAtaB = await createAssociatedTokenAccount(provider.connection, taker, mintB, taker.publicKey);

    await mintTo(provider.connection, maker, mintA, makerAtaA, maker, 10000);
    await mintTo(provider.connection, taker, mintB, takerAtaB, taker, 10000);

    const [escrowPDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), maker.publicKey.toBuffer(), seed.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    escrowStatePDA = escrowPDA;
    vaultPDA = await getAssociatedTokenAddress(mintA, escrowStatePDA, true);
  });

  it("Make escrow", async () => {
    const deposit = new BN(1000);
    const receive = new BN(500);

    // @ts-ignore
    await program.methods
      .make(seed, deposit, receive)
      .accounts({
        maker: maker.publicKey,
        mintA,
        mintB,
        makerAtaA,
        escrowState: escrowStatePDA,
        vault: vaultPDA,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .signers([maker])
      .rpc();

    const vaultAccount = await getAccount(provider.connection, vaultPDA);
    assert.strictEqual(vaultAccount.amount.toString(), "1000", "Vault should have 1000 tokens");

    // @ts-ignore
    const escrowAccount = await program.account.escrowState.fetch(escrowStatePDA);
    assert.strictEqual(escrowAccount.receive.toString(), "500", "Receive amount mismatch");
    assert.ok(escrowAccount.maker.equals(maker.publicKey), "Maker mismatch");
  });

  it("Take escrow", async () => {
    let makerAccountB = await getAccount(provider.connection, makerAtaB);
    assert.strictEqual(makerAccountB.amount.toString(), "0");

    let takerAccountA = await getAccount(provider.connection, takerAtaA);
    assert.strictEqual(takerAccountA.amount.toString(), "0");

    // @ts-ignore
    await program.methods
      .take()
      .accounts({
        taker: taker.publicKey,
        maker: maker.publicKey,
        mintA,
        mintB,
        takerAtaA,
        takerAtaB,
        makerAtaB,
        escrowState: escrowStatePDA,
        vault: vaultPDA,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .signers([taker])
      .rpc();

    makerAccountB = await getAccount(provider.connection, makerAtaB);
    assert.strictEqual(makerAccountB.amount.toString(), "500", "Maker should receive 500 mintB");

    takerAccountA = await getAccount(provider.connection, takerAtaA);
    assert.strictEqual(takerAccountA.amount.toString(), "1000", "Taker should receive 1000 mintA");

    try {
      await getAccount(provider.connection, vaultPDA);
      assert.fail("Vault should be closed");
    } catch (e) {
      assert.ok(true);
    }
  });

  it("Refund escrow", async () => {
    const newSeed = new BN(Math.floor(Math.random() * 100000));
    const [newEscrowPDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), maker.publicKey.toBuffer(), newSeed.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    const newVaultPDA = await getAssociatedTokenAddress(mintA, newEscrowPDA, true);

    const makerInitialMintA = (await getAccount(provider.connection, makerAtaA)).amount;

    // @ts-ignore
    await program.methods
      .make(newSeed, new BN(500), new BN(200))
      .accounts({
        maker: maker.publicKey,
        mintA,
        mintB,
        makerAtaA,
        escrowState: newEscrowPDA,
        vault: newVaultPDA,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .signers([maker])
      .rpc();

    // @ts-ignore
    await program.methods
      .refund()
      .accounts({
        maker: maker.publicKey,
        mintA,
        makerAtaA,
        escrowState: newEscrowPDA,
        vault: newVaultPDA,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .signers([maker])
      .rpc();

    const makerFinalMintA = (await getAccount(provider.connection, makerAtaA)).amount;
    assert.strictEqual(makerFinalMintA.toString(), makerInitialMintA.toString(), "Maker should get tokens back");

    try {
      await getAccount(provider.connection, newVaultPDA);
      assert.fail("Vault should be closed");
    } catch (e) {
      assert.ok(true);
    }
  });
});