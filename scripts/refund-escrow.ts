#!/usr/bin/env ts-node
/**
 * Script: refund-escrow.ts
 * Cancela um escrow existente e recupera os tokens como maker.
 * 
 * Uso:
 *   npx ts-node scripts/refund-escrow.ts <ESCROW_STATE_ADDRESS>
 * 
 * Exemplo:
 *   npx ts-node scripts/refund-escrow.ts ABC123...
 */

import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import {
    getOrCreateAssociatedTokenAccount,
    getAssociatedTokenAddress,
    TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey, Connection, clusterApiUrl } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import os from "os";

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 1) {
        console.error("Uso: npx ts-node scripts/refund-escrow.ts <ESCROW_STATE_ADDRESS>");
        process.exit(1);
    }

    const escrowState = new PublicKey(args[0]);

    // Carrega a keypair do maker (wallet padrão da Solana CLI)
    const keypairPath = path.join(os.homedir(), ".config/solana/id.json");
    const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf-8")));
    const maker = anchor.web3.Keypair.fromSecretKey(secretKey);

    const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
    const wallet = new anchor.Wallet(maker);
    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
    anchor.setProvider(provider);

    const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "../target/idl/escrow.json"), "utf-8"));
    const programId = new PublicKey("4gcCzSgtJ9zBesZK5BXCD5TzCfuNXz9MHWsax6NjjrKK");
    const program = new Program(idl, provider);

    // Lê os dados do escrow on-chain
    // @ts-ignore
    const escrowData = await program.account.escrowState.fetch(escrowState);
    const mintA = escrowData.mintA as PublicKey;

    console.log("\n📋 Dados do escrow encontrado:");
    console.log("  Maker:       ", maker.publicKey.toBase58());
    console.log("  Mint A:      ", mintA.toBase58());
    console.log("  Deposit:     ", escrowData.receive.toString(), "(tokens no vault)");

    // Deriva ATAs
    const makerAtaA = await getOrCreateAssociatedTokenAccount(connection, maker, mintA, maker.publicKey);
    const vault = await getAssociatedTokenAddress(mintA, escrowState, true);

    console.log("\n↩️  Solicitando refund...");
    console.log("  MakerAtaA:   ", makerAtaA.address.toBase58());
    console.log("  Vault:       ", vault.toBase58());

    // @ts-ignore
    const tx = await program.methods
        .refund()
        .accounts({
            maker: maker.publicKey,
            mintA,
            makerAtaA: makerAtaA.address,
            escrowState,
            vault,
            tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .signers([maker])
        .rpc();

    console.log("\n✅ Refund realizado com sucesso!");
    console.log("  Signature:   ", tx);
    console.log("  Explorer:    ", `https://explorer.solana.com/tx/${tx}?cluster=devnet`);
}

main().catch((err) => {
    console.error("Erro:", err);
    process.exit(1);
});