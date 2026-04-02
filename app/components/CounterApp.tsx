"use client";

import { FC, useState, useCallback, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useProgram } from "../lib/useProgram";
import styles from "./CounterApp.module.css";

type TxStatus = "idle" | "loading" | "success" | "error";

interface LogEntry {
  id: number;
  action: string;
  sig?: string;
  error?: string;
  ts: string;
}

// We persist the counter keypair in sessionStorage so it survives re-renders
function getOrCreateCounterKeypair(): Keypair {
  if (typeof window === "undefined") return Keypair.generate();
  const stored = sessionStorage.getItem("counter_keypair");
  if (stored) {
    const raw = Uint8Array.from(JSON.parse(stored));
    return Keypair.fromSecretKey(raw);
  }
  const kp = Keypair.generate();
  sessionStorage.setItem(
    "counter_keypair",
    JSON.stringify(Array.from(kp.secretKey))
  );
  return kp;
}

export const CounterApp: FC = () => {
  const { publicKey } = useWallet();
  const { program, connection } = useProgram();

  const [count, setCount] = useState<number | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [status, setStatus] = useState<TxStatus>("idle");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [counterKeypair] = useState(getOrCreateCounterKeypair);
  const [balance, setBalance] = useState<number | null>(null);

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

  // Fetch counter state from the chain
  const fetchCounter = useCallback(async () => {
    if (!program) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const acc = await (program.account as any).counter.fetch(
        counterKeypair.publicKey
      );
      setCount(acc.count.toNumber());
      setOwner(acc.owner.toBase58());
      setInitialized(true);
    } catch {
      setInitialized(false);
      setCount(null);
    }
  }, [program, counterKeypair]);

  // Fetch SOL balance
  const fetchBalance = useCallback(async () => {
    if (!publicKey) return;
    const bal = await connection.getBalance(publicKey);
    setBalance(bal / LAMPORTS_PER_SOL);
  }, [publicKey, connection]);

  useEffect(() => {
    fetchCounter();
    fetchBalance();
  }, [fetchCounter, fetchBalance]);

  // Airdrop 2 SOL (only works on localnet/devnet)
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
    async (
      action: string,
      fn: () => Promise<string>
    ) => {
      setStatus("loading");
      try {
        const sig = await fn();
        await fetchCounter();
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
    [fetchCounter, addLog]
  );

  // ── Instructions ────────────────────────────────────────────────────────────
  const handleInitialize = () =>
    runTx("Initialize", async () => {
      if (!program || !publicKey) throw new Error("Wallet not connected");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (program.methods as any)
        .initialize()
        .accounts({
          counter: counterKeypair.publicKey,
          user: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([counterKeypair])
        .rpc();
    });

  const handleIncrement = () =>
    runTx("Increment", async () => {
      if (!program || !publicKey) throw new Error("Wallet not connected");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (program.methods as any)
        .increment()
        .accounts({ counter: counterKeypair.publicKey, user: publicKey })
        .rpc();
    });

  const handleDecrement = () =>
    runTx("Decrement", async () => {
      if (!program || !publicKey) throw new Error("Wallet not connected");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (program.methods as any)
        .decrement()
        .accounts({ counter: counterKeypair.publicKey, user: publicKey })
        .rpc();
    });

  const handleReset = () =>
    runTx("Reset", async () => {
      if (!program || !publicKey) throw new Error("Wallet not connected");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (program.methods as any)
        .reset()
        .accounts({ counter: counterKeypair.publicKey, user: publicKey })
        .rpc();
    });

  const isLoading = status === "loading";

  return (
    <div className={styles.root}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.logo}>◎</span>
          <div>
            <h1 className={styles.title}>Counter Program</h1>
            <p className={styles.subtitle}>Solana · Anchor Bootcamp Aula 2</p>
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
                  title="Solicitar 2 SOL de airdrop (localnet/devnet)"
                >
                  💧 Airdrop
                </button>
              )}
            </div>
          )}
          <WalletMultiButton />
        </div>
      </header>

      {/* ── Low balance warning ─────────────────────────────────────────── */}
      {publicKey && balance !== null && balance < 0.05 && (
        <div className={styles.warning}>
          <span>⚠️ Saldo insuficiente para pagar o rent.</span>
          <button
            className={styles.airdropBtnInline}
            onClick={handleAirdrop}
            disabled={status === "loading"}
          >
            💧 Solicitar Airdrop (2 SOL)
          </button>
        </div>
      )}

      <main className={styles.main}>
        {/* ── Counter Card ────────────────────────────────────────────── */}
        <div className={styles.card}>
          <div className={styles.counterSection}>
            <p className={styles.label}>Valor atual</p>
            <div className={`${styles.counterValue} ${isLoading ? styles.pulse : ""}`}>
              {count !== null ? count : "—"}
            </div>

            {status === "success" && (
              <div className={styles.badge} data-variant="success">✓ Confirmado</div>
            )}
            {status === "error" && (
              <div className={styles.badge} data-variant="error">✗ Erro</div>
            )}
          </div>

          {/* ── Account Info ───────────────────────────────────────────── */}
          <div className={styles.infoRow}>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Account</span>
              <span className={styles.infoValue}>
                {counterKeypair.publicKey.toBase58().slice(0, 12)}…
              </span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Owner</span>
              <span className={styles.infoValue}>
                {owner ? owner.slice(0, 12) + "…" : "—"}
              </span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Status</span>
              <span
                className={styles.infoValue}
                data-status={initialized ? "active" : "inactive"}
              >
                {initialized ? "● Ativo" : "○ Não inicializado"}
              </span>
            </div>
          </div>

          {/* ── Buttons ────────────────────────────────────────────────── */}
          {!publicKey ? (
            <p className={styles.connectPrompt}>
              Conecte sua carteira para interagir
            </p>
          ) : !initialized ? (
            <div className={styles.actions}>
              <button
                className={`${styles.btn} ${styles.btnInit}`}
                onClick={handleInitialize}
                disabled={isLoading}
              >
                {isLoading ? "Enviando…" : "⚡ Inicializar Contador"}
              </button>
            </div>
          ) : (
            <div className={styles.actions}>
              <button
                className={`${styles.btn} ${styles.btnUp}`}
                onClick={handleIncrement}
                disabled={isLoading}
              >
                <span className={styles.btnIcon}>▲</span>
                Increment
              </button>
              <button
                className={`${styles.btn} ${styles.btnDown}`}
                onClick={handleDecrement}
                disabled={isLoading}
              >
                <span className={styles.btnIcon}>▼</span>
                Decrement
              </button>
              <button
                className={`${styles.btn} ${styles.btnReset}`}
                onClick={handleReset}
                disabled={isLoading}
              >
                <span className={styles.btnIcon}>↺</span>
                Reset
              </button>
            </div>
          )}
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
                      {entry.sig.slice(0, 20)}…
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
