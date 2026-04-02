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
│   └── escrow/
│       └── src/
│           └── lib.rs          # Contrato Anchor (make, take, refund)
├── tests/
│   └── escrow.ts               # Suite de testes (3 testes)
├── scripts/
│   ├── make-escrow.ts          # Script devnet: criar escrow
│   ├── take-escrow.ts          # Script devnet: aceitar escrow
│   └── refund-escrow.ts        # Script devnet: cancelar escrow
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

A suite de testes está em `tests/escrow.ts` e cobre **3 cenários** completos:

### Teste 1 — Make escrow
- Cria dois mints SPL (Token A e Token B) e faz airdrop de SOL para maker e taker
- Cria as Associated Token Accounts e minta tokens para cada parte
- Chama a instrução `make` com `deposit = 1000` e `receive = 500`
- **Verifica** que o vault recebeu exatamente 1000 tokens de Token A
- **Verifica** que a conta `EscrowState` foi criada com os dados corretos

### Teste 2 — Take escrow
- Parte do estado criado no teste anterior
- Chama a instrução `take` com o taker
- **Verifica** que o maker recebeu 500 tokens de Token B
- **Verifica** que o taker recebeu 1000 tokens de Token A
- **Verifica** que o vault foi fechado após a troca

### Teste 3 — Refund escrow
- Cria um novo escrow (`make` com `deposit = 500`, `receive = 200`)
- Chama a instrução `refund` pelo maker
- **Verifica** que o saldo de Token A do maker voltou ao valor original
- **Verifica** que o vault foi fechado após o refund

```bash
# Instalar dependências na raiz
npm install

# Rodar os 3 testes no localnet (sobe validador local automaticamente)
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

## Testando na Devnet com os scripts

Os scripts em `scripts/` permitem interagir com o programa deployado na devnet diretamente pelo terminal.

### Pré-requisito dos scripts

```bash
# Instalar ts-node globalmente
npm install -g ts-node typescript

# Configurar CLI para devnet
solana config set --url devnet

# Verificar saldo (mínimo 0.1 SOL)
solana balance
# Se precisar: https://faucet.solana.com
```

### Passo 1 — Criar um escrow (Make)

```bash
npx ts-node scripts/make-escrow.ts <MINT_A> <MINT_B> <DEPOSIT> <RECEIVE>
```

O script imprime o endereço do `EscrowState` no final — **salve esse endereço**.

Saída esperada:
```
✅ Escrow criado com sucesso!
  Signature:    2Mf3X36Nh...
  Explorer:     https://explorer.solana.com/tx/2Mf3X36Nh...?cluster=devnet

📋 Salve o EscrowState para usar nos scripts take/refund:
  EscrowState:  ABC123xyz...
```

### Passo 2a — Aceitar o escrow (Take)

```bash
npx ts-node scripts/take-escrow.ts <ESCROW_STATE_ADDRESS>
```

Saída esperada:
```
✅ Escrow aceito com sucesso!
  Signature:    3Xk9...
  Explorer:     https://explorer.solana.com/tx/3Xk9...?cluster=devnet
```

### Passo 2b — Cancelar e reembolsar (Refund)

```bash
npx ts-node scripts/refund-escrow.ts <ESCROW_STATE_ADDRESS>
```

Saída esperada:
```
✅ Refund realizado com sucesso!
  Signature:    7Yw2...
  Explorer:     https://explorer.solana.com/tx/7Yw2...?cluster=devnet
```

> **Nota:** Use `take` **ou** `refund` para um mesmo escrow, nunca os dois.

---

## Como rodar o frontend

```bash
cd app
npm install
npm run dev
```

Acesse **http://localhost:3000** no navegador.

### Configuração da carteira

1. Instale a extensão [Phantom Wallet](https://phantom.app/)
2. Nas configurações da Phantom, mude a rede para **Devnet**
3. Solicite SOL de teste em [faucet.solana.com](https://faucet.solana.com)
4. Conecte a carteira no frontend e interaja com o escrow

### Funcionalidades do frontend

- **Create Escrow** — define Token A, Token B, quantidade a depositar e a receber
- **Take Escrow** — aceita um escrow existente pelo endereço da conta `EscrowState`
- **Refund** — cancela e recupera os tokens de um escrow criado pelo maker conectado

---

## Como fazer deploy na devnet

```bash
solana config set --url devnet
solana airdrop 2           # ou https://faucet.solana.com
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