import { useMemo } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, setProvider, Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import idl from "./counter_program.json";

export const PROGRAM_ID = new PublicKey(
  "FJKTbA7i4yVJoecGh2w1nmRQgRrVQpaGa1VvBz6Ug2HP"
);

export function useProgram() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const program = useMemo(() => {
    if (!wallet.publicKey || !wallet.signTransaction) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const provider = new AnchorProvider(connection, wallet as any, {
      commitment: "confirmed",
    });
    setProvider(provider);

    return new Program(idl as Idl, provider);
  }, [connection, wallet]);

  return { program, connection };
}
