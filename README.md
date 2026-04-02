# Solana Escrow — Anchor

Programa de escrow para troca atômica de SPL Tokens na Solana, desenvolvido com o framework Anchor.

Permite que dois usuários troquem tokens de forma **trustless** (sem necessidade de confiar um no outro), usando PDAs como vault intermediário. Os fundos só são liberados quando o taker aceita os termos definidos pelo maker — funcionando como um contrato de pagamento condicional.

## Program ID (Devnet)

```
4gcCzSgtJ9zBesZK5BXCD5TzCfuNXz9MHWsax6NjjrKK
```

🔎 [Ver no Solana Explorer](https://explorer.solana.com/address/4gcCzSgtJ9zBesZK5BXCD5TzCfuNXz9MHWsax6NjjrKK?cluster=devnet)

---

## O que o programa faz

O escrow funciona em 3 etapas:

1. **Maker** cria o escrow depositando Token A em um vault (PDA) e define quanto Token B deseja receber em troca.
2. **Taker** aceita o escrow enviando Token B ao maker e recebe Token A do vault automaticamente.
3. Se o maker quiser cancelar antes de alguém aceitar, ele pode chamar **refund** para recuperar os tokens.

Todo o processo é on-chain e sem custódia — nenhuma parte precisa confiar na outra.

---

## Instruções disponíveis

### `make(seed, deposit, receive)`
Cria um novo escrow.

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `seed` | `u64` | Número aleatório que permite múltiplos escrows pelo mesmo maker |
| `deposit` | `u64` | Quantidade de Token A a depositar no vault |
| `receive` | `u64` | Quantidade de Token B que o maker deseja receber |

- Transfere `deposit` tokens do maker para o vault (PDA)
- Cria a conta `EscrowState` com os dados da negociação

### `take()`
Aceita o escrow e executa a troca atômica.

- O taker envia `receive` tokens de Token B para o maker
- O vault libera todos os tokens de Token A para o taker
- O vault e a conta `EscrowState` são fechados (rent devolvida ao maker)

### `refund()`
Cancela o escrow e devolve os tokens ao maker.

- Só pode ser chamada pelo maker
- Transfere os tokens do vault de volta ao maker
- Fecha o vault e a conta `EscrowState`

---

## PDAs utilizadas

| PDA | Seeds | Descrição |
|-----|-------|-----------|
| `EscrowState` | `["escrow", maker_pubkey, seed_u64_le]` | Armazena os dados do escrow |
| `Vault` | ATA com authority = `EscrowState` | Guarda os tokens Token A durante o escrow |

---

## Estrutura do projeto

```
.
├── programs/
│   └── counter-program/
│       └── src/
│           └── lib.rs          # Contrato Anchor (make, take, refund)
├── tests/
│   └── escrow.ts               # Suite de testes (make, take, refund)
├── app/                        # Frontend Next.js
├── Anchor.toml
└── Cargo.toml
```

---

## Pré-requisitos

- [Rust](https://www.rust-lang.org/tools/install)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools)
- [Anchor CLI 0.32.1](https://www.anchor-lang.com/docs/installation)
- Node.js >= 18 e npm

---

## Como rodar os testes

```bash
# Instalar dependências
npm install

# Rodar os testes no localnet (sobe validador automaticamente)
anchor test
```

Saída esperada:

```
escrow
  ✔ Make escrow
  ✔ Take escrow
  ✔ Refund escrow

3 passing
```

---

## Como fazer deploy na devnet

```bash
# Configurar para devnet
solana config set --url devnet

# Solicitar SOL para pagar o deploy
solana airdrop 2
# ou use https://faucet.solana.com

# Build e deploy
anchor build
anchor deploy
```

---

## Stack

| Tecnologia | Versão |
|-----------|--------|
| Anchor | 0.32.1 |
| anchor-spl | 0.32.1 |
| @coral-xyz/anchor | 0.32.1 |
| @solana/spl-token | latest |
| Next.js (frontend) | 14 |