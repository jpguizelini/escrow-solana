"use client";

import { FC, useState, useCallback, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Keypair, SystemProgram, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { useProgram } from "../lib/useProgram";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { BN } from "bn.js";
import styles from "./EscrowApp.module.css";

type TxStatus = "idle" | "loading" | "success" | "error";

interface LogEntry {
  id: number;
  action: string;
  sig?: string;
  error?: string;
  ts: string;
}

export const EscrowApp: FC = () => {
  const { publicKey } = useWallet();
  const { program, connection } = useProgram();

  const [status, setStatus] = useState<TxStatus>("idle");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [balance, setBalance] = useState<number | null>(null);

  // Form states
  const [mintA, setMintA] = useState("");
  const [mintB, setMintB] = useState("");
  const [deposit, setDeposit] = useState("");
  const [receive, setReceive] = useState("");
  const [seed, setSeed] = useState("");

  const [takeEscrowState, setTakeEscrowState] = useState("");
  const [refundEscrowState, setRefundEscrowState] = useState("");

  const addLog = useCallback(
    (action: string, sig?: string, error?: string) => {
      setLog((prev) => [
        {
          id: Date.now(),
          action,
          sig,
          error,
          ts: new Date().toLocaleTimeString(),
        },
        ...prev.slice(0, 9),
      ]);
    },
    []
  );

  const fetchBalance = useCallback(async () => {
    if (!publicKey) return;
    const bal = await connection.getBalance(publicKey);
    setBalance(bal / LAMPORTS_PER_SOL);
  }, [publicKey, connection]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  const handleAirdrop = useCallback(async () => {
    if (!publicKey) return;
    setStatus("loading");
    try {
      const sig = await connection.requestAirdrop(publicKey, 2 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig);
      await fetchBalance();
      addLog("Airdrop 2 SOL", sig);
      setStatus("success");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog("Airdrop", undefined, msg);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }, [publicKey, connection, fetchBalance, addLog]);

  const runTx = useCallback(
    async (action: string, fn: () => Promise<string>) => {
      setStatus("loading");
      try {
        const sig = await fn();
        addLog(action, sig);
        setStatus("success");
        setTimeout(() => setStatus("idle"), 2000);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        addLog(action, undefined, msg);
        setStatus("error");
        setTimeout(() => setStatus("idle"), 3000);
      }
    },
    [addLog]
  );

  // instructions
  const handleMake = () =>
    runTx("Make Escrow", async () => {
      if (!program || !publicKey) throw new Error("Wallet not connected");

      const parsedSeed = new BN(seed);
      const depositBn = new BN(deposit);
      const receiveBn = new BN(receive);

      const mintAPubkey = new PublicKey(mintA);
      const mintBPubkey = new PublicKey(mintB);

      const makerAtaA = await getAssociatedTokenAddress(mintAPubkey, publicKey);

      const [escrowState] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), publicKey.toBuffer(), parsedSeed.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      const vault = await getAssociatedTokenAddress(mintAPubkey, escrowState, true);

      // @ts-ignore
      return program.methods
        .make(parsedSeed, depositBn, receiveBn)
        .accounts({
          maker: publicKey,
          mintA: mintAPubkey,
          mintB: mintBPubkey,
          makerAtaA,
          escrowState,
          vault,
        })
        .rpc();
    });

  const handleTake = () =>
    runTx("Take Escrow", async () => {
      if (!program || !publicKey) throw new Error("Wallet not connected");

      const escrowStatePubkey = new PublicKey(takeEscrowState);

      // Fetch escrow state
      // @ts-ignore
      const escrowStateData = await program.account.escrowState.fetch(escrowStatePubkey);

      const makerPubkey = escrowStateData.maker;
      const mintAPubkey = escrowStateData.mintA;
      const mintBPubkey = escrowStateData.mintB;

      const takerAtaA = await getAssociatedTokenAddress(mintAPubkey, publicKey);
      const takerAtaB = await getAssociatedTokenAddress(mintBPubkey, publicKey);
      const makerAtaB = await getAssociatedTokenAddress(mintBPubkey, makerPubkey);

      const vault = await getAssociatedTokenAddress(mintAPubkey, escrowStatePubkey, true);

      // @ts-ignore
      return program.methods
        .take()
        .accounts({
          taker: publicKey,
          maker: makerPubkey,
          mintA: mintAPubkey,
          mintB: mintBPubkey,
          takerAtaA,
          takerAtaB,
          makerAtaB,
          escrowState: escrowStatePubkey,
          vault,
        })
        .rpc();
    });

  const handleRefund = () =>
    runTx("Refund Escrow", async () => {
      if (!program || !publicKey) throw new Error("Wallet not connected");

      const escrowStatePubkey = new PublicKey(refundEscrowState);

      // Fetch escrow state
      // @ts-ignore
      const escrowStateData = await program.account.escrowState.fetch(escrowStatePubkey);
      const mintAPubkey = escrowStateData.mintA;

      const makerAtaA = await getAssociatedTokenAddress(mintAPubkey, publicKey);
      const vault = await getAssociatedTokenAddress(mintAPubkey, escrowStatePubkey, true);

      // @ts-ignore
      return program.methods
        .refund()
        .accounts({
          maker: publicKey,
          mintA: mintAPubkey,
          makerAtaA,
          escrowState: escrowStatePubkey,
          vault,
        })
        .rpc();
    });

  const isLoading = status === "loading";

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.logo}>◎</span>
          <div>
            <h1 className={styles.title}>SPL Token Escrow</h1>
            <p className={styles.subtitle}>Secure P2P Swaps (Anchor)</p>
          </div>
        </div>
        <div className={styles.headerRight}>
          {publicKey && balance !== null && (
            <div className={styles.balanceBadge}>
              <span className={styles.balanceAmount}>{balance.toFixed(2)} SOL</span>
              {balance < 0.1 && (
                <button
                  className={styles.airdropBtn}
                  onClick={handleAirdrop}
                  disabled={status === "loading"}
                >
                  💧 Airdrop
                </button>
              )}
            </div>
          )}
          <WalletMultiButton />
        </div>
      </header>

      <main className={styles.main}>
        {/* Make Escrow Card */}
        <div className={styles.card}>
          <h2 className={styles.logTitle}>Create Escrow (Make)</h2>
          <div className={styles.actions} style={{ flexDirection: "column", alignItems: "stretch", gap: "12px" }}>
            <input type="text" placeholder="Mint A Address" value={mintA} onChange={(e) => setMintA(e.target.value)} style={{ padding: "8px", borderRadius: "8px", border: "1px solid #ccc" }} />
            <input type="text" placeholder="Mint B Address" value={mintB} onChange={(e) => setMintB(e.target.value)} style={{ padding: "8px", borderRadius: "8px", border: "1px solid #ccc" }} />
            <input type="number" placeholder="Deposit Amount" value={deposit} onChange={(e) => setDeposit(e.target.value)} style={{ padding: "8px", borderRadius: "8px", border: "1px solid #ccc" }} />
            <input type="number" placeholder="Receive Amount" value={receive} onChange={(e) => setReceive(e.target.value)} style={{ padding: "8px", borderRadius: "8px", border: "1px solid #ccc" }} />
            <input type="number" placeholder="Random Seed (e.g. 1)" value={seed} onChange={(e) => setSeed(e.target.value)} style={{ padding: "8px", borderRadius: "8px", border: "1px solid #ccc" }} />
            <button className={`${styles.btn} ${styles.btnInit}`} onClick={handleMake} disabled={isLoading || !publicKey}>
              {isLoading ? "Enviando…" : "⚡ Make Escrow"}
            </button>
          </div>
        </div>

        {/* Take Escrow Card */}
        <div className={styles.card} style={{ marginTop: "20px" }}>
          <h2 className={styles.logTitle}>Fulfill Escrow (Take)</h2>
          <div className={styles.actions} style={{ flexDirection: "column", alignItems: "stretch", gap: "12px" }}>
            <input type="text" placeholder="Escrow State Address" value={takeEscrowState} onChange={(e) => setTakeEscrowState(e.target.value)} style={{ padding: "8px", borderRadius: "8px", border: "1px solid #ccc" }} />
            <button className={`${styles.btn} ${styles.btnUp}`} onClick={handleTake} disabled={isLoading || !publicKey}>
              <span className={styles.btnIcon}>🤝</span> Take
            </button>
          </div>
        </div>

        {/* Refund Escrow Card */}
        <div className={styles.card} style={{ marginTop: "20px" }}>
          <h2 className={styles.logTitle}>Cancel Escrow (Refund)</h2>
          <div className={styles.actions} style={{ flexDirection: "column", alignItems: "stretch", gap: "12px" }}>
            <input type="text" placeholder="Escrow State Address" value={refundEscrowState} onChange={(e) => setRefundEscrowState(e.target.value)} style={{ padding: "8px", borderRadius: "8px", border: "1px solid #ccc" }} />
            <button className={`${styles.btn} ${styles.btnReset}`} onClick={handleRefund} disabled={isLoading || !publicKey}>
              <span className={styles.btnIcon}>↺</span> Refund
            </button>
          </div>
        </div>

        {/* ── Transaction Log ──────────────────────────────────────────── */}
        <div className={styles.logCard}>
          <h2 className={styles.logTitle}>Histórico de Transações</h2>
          {log.length === 0 ? (
            <p className={styles.logEmpty}>Nenhuma transação ainda.</p>
          ) : (
            <ul className={styles.logList}>
              {log.map((entry) => (
                <li key={entry.id} className={styles.logEntry}>
                  <span className={styles.logTs}>{entry.ts}</span>
                  <span className={`${styles.logAction} ${entry.error ? styles.logError : styles.logOk}`}>
                    {entry.action}
                  </span>
                  {entry.sig && (
                    <span className={styles.logSig}>
                       <a href={`https://explorer.solana.com/tx/${entry.sig}?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899`} target="_blank" rel="noopener noreferrer" style={{ color: "#a855f7" }}>
                         {entry.sig.slice(0, 20)}…
                       </a>
                    </span>
                  )}
                  {entry.error && (
                    <span className={styles.logErrorMsg}>
                      {entry.error.slice(0, 60)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
};
