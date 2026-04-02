#!/usr/bin/env ts-node
/**
 * Script: make-escrow.ts
 * Cria um escrow na devnet depositando Token A e definindo quanto Token B quer receber.
 * 
 * Uso:
 *   npx ts-node scripts/make-escrow.ts <MINT_A> <MINT_B> <DEPOSIT> <RECEIVE>
 * 
 * Exemplo:
 *   npx ts-node scripts/make-escrow.ts So11... EPjF... 1000 500
 */

import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import {
    getOrCreateAssociatedTokenAccount,
    TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey, Connection, clusterApiUrl } from "@solana/web3.js";
import { BN } from "bn.js";
import fs from "fs";
import path from "path";
import os from "os";

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 4) {
        console.error("Uso: npx ts-node scripts/make-escrow.ts <MINT_A> <MINT_B> <DEPOSIT> <RECEIVE>");
        process.exit(1);
    }

    const [mintAStr, mintBStr, depositStr, receiveStr] = args;
    const mintA = new PublicKey(mintAStr);
    const mintB = new PublicKey(mintBStr);
    const deposit = new BN(depositStr);
    const receive = new BN(receiveStr);

    // Carrega a keypair do maker (wallet padrão da Solana CLI)
    const keypairPath = path.join(os.homedir(), ".config/solana/id.json");
    const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf-8")));
    const maker = anchor.web3.Keypair.fromSecretKey(secretKey);

    const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
    const wallet = new anchor.Wallet(maker);
    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
    anchor.setProvider(provider);

    // Carrega o IDL gerado pelo anchor build
    const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "../target/idl/escrow.json"), "utf-8"));
    const programId = new PublicKey("4gcCzSgtJ9zBesZK5BXCD5TzCfuNXz9MHWsax6NjjrKK");
    const program = new Program(idl, provider);

    // Gera seed aleatório
    const seed = new BN(Math.floor(Math.random() * 1_000_000));

    // Deriva PDAs
    const [escrowState] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), maker.publicKey.toBuffer(), seed.toArrayLike(Buffer, "le", 8)],
        programId
    );

    // ATA do maker para Token A
    const makerAtaA = await getOrCreateAssociatedTokenAccount(
        connection, maker, mintA, maker.publicKey
    );

    // Vault: ATA com authority = escrowState
    const { getAssociatedTokenAddress } = await import("@solana/spl-token");
    const vault = await getAssociatedTokenAddress(mintA, escrowState, true);

    console.log("\n🔧 Criando escrow...");
    console.log("  Maker:       ", maker.publicKey.toBase58());
    console.log("  Mint A:      ", mintA.toBase58());
    console.log("  Mint B:      ", mintB.toBase58());
    console.log("  Deposit:     ", deposit.toString());
    console.log("  Receive:     ", receive.toString());
    console.log("  Seed:        ", seed.toString());
    console.log("  EscrowState: ", escrowState.toBase58());
    console.log("  Vault:       ", vault.toBase58());

    // @ts-ignore
    const tx = await program.methods
        .make(seed, deposit, receive)
        .accounts({
            maker: maker.publicKey,
            mintA,
            mintB,
            makerAtaA: makerAtaA.address,
            escrowState,
            vault,
            tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .signers([maker])
        .rpc();

    console.log("\n✅ Escrow criado com sucesso!");
    console.log("  Signature:   ", tx);
    console.log("  Explorer:    ", `https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    console.log("\n📋 Salve o EscrowState para usar nos scripts take/refund:");
    console.log("  EscrowState: ", escrowState.toBase58());
}

main().catch((err) => {
    console.error("Erro:", err);
    process.exit(1);
});