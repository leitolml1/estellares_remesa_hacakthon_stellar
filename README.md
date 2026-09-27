# Estelares Remesa

**Argentina Builder Challenge (BAF x Stellar) — Track Genesis.**

Remesa Directa solves a concrete problem: sending money between families
(e.g. remittances from abroad) and organizing a family's shared money today
goes through banks or virtual wallets that charge high fees, take days, and
sometimes hold funds. Remesa Directa solves it with Stellar: send money,
pool donations for a shared cause, and save as a family with clear rules
about who can withdraw how much — all with fees of fractions of a cent,
confirmation in seconds, and without the app itself ever being able to touch
the funds.

- **API in production (Render)**: https://estellares-remesa-hacakthon-stellar.onrender.com
- **Frontend in production (Vercel)**: https://frontend-estellares.vercel.app/
- **Network**: Stellar Testnet (Horizon + Soroban RPC)

---

## 1. Project vision

To be the simplest, cheapest and most transparent way for families to send
and manage money across countries: a remittance arriving in seconds with a
fee of fractions of a cent, donations to a shared cause with auditable
on-chain rules, and a family's shared savings with clear rules nobody can
bypass — not even the app itself.

Going forward, the project aims at: supporting **any stablecoin and local
on/off-ramp** (so the sender pays in their currency and the recipient gets
paid in theirs with no friction), real authentication signed by the wallet
on every call, and the jump to **mainnet** with real DEX liquidity.

## 2. What it is

A web application (frontend + API + smart contract) built on **Stellar**
with three integrated modules:

1. **P2P payments with metadata** — direct transfers between wallets, in
   XLM, USDC or EURC, with a note and expense category (something Stellar
   doesn't store but is useful to the user).
2. **Community donation pools** — fundraisers for a shared cause custodied
   in an **own Soroban contract**, with a payment QR (SEP-7) and an on-chain
   donor leaderboard.
3. **Family savings box** — a shared Stellar account with **native
   multisig** (signers, thresholds and withdrawal limits) and **yield via
   Blend Protocol**.

The core principle across all three modules: **non-custodial**. The backend
never sees or signs a private key — it builds the unsigned transaction
(XDR), the user signs it with their wallet (Freighter), the backend
re-validates it before sending it to the network, and only then is it
submitted.

## 3. What it does, module by module

### Module 1 — P2P payments with metadata ✅

- Transfers between wallets in **XLM, USDC or EURC**, with note and category.
- **Quote tool** (`GET /api/payments/quote/`): how much the recipient gets
  if you send one asset and they need another (e.g. you have XLM, your mom
  wants USDC). It tries the real Horizon DEX path; if testnet has no
  liquidity, it falls back to a fixed reference rate so the user is never
  left without a quote.
- **Combined history**: the Stellar ledger is the source of truth for
  amount/date/status; Postgres only stores note/category, joined by
  transaction hash.
- **Recurring transfers** ("send mom money every month"): without custody
  the backend can't debit on its own — it stores the rule (amount,
  frequency, next date) and the frontend reminds the user to pay with their
  wallet when it's due.

### Module 2 — Community donation pools ✅

- Anyone donates to a pool by scanning a **QR** (**SEP-7** URI, opens in
  any Stellar wallet, no need to install the app).
- The donation is custodied in an **own Soroban contract**
  (`vault_contract/`, Rust), not in the pool creator's wallet — rules
  enforced **on-chain**, not just in the backend:
  - If the pool reached its goal, the contract rejects new donations.
  - The pool owner cannot donate to their own pool.
  - Only the owner can withdraw, and never more than that specific pool
    received (even if the contract holds funds from other pools).
- **On-chain donor leaderboard**: ranking of who donated most to each pool,
  read directly from the contract.

### Module 3 — Family savings box (multisig + Blend) ✅

- A Stellar account shared by a family with **native multisig** (Stellar's
  own signers-and-thresholds mechanism, not a contract):
  - Signers with different roles: those who can only deposit, those who can
    deposit and withdraw, and thresholds that auto-adjust when signers are
    added/removed.
  - Withdrawal limits configurable per asset (e.g. "up to 100 USDC at a
    time").
  - Withdrawals that require collecting signatures from several members
    before being sent.
- **Yield via Blend Protocol**: the box can lend its XLM/USDC to Blend's
  lending pool, and there is a read-only endpoint showing principal vs.
  interest earned, read directly from Blend's contract (no made-up numbers
  in a database).

## 4. Problem

Today, sending money between families and organizing shared money goes
through banks or virtual wallets that:

- **Charge high fees** on every remittance (large percentages in informal
  corridors, large flat fees in formal ones).
- **Take days** to credit the money.
- **Hold or freeze funds** without explanation.
- **Offer no traceability**: if a family raises money for a cause (a medical
  treatment, a trip), nobody can audit how much came in, who contributed
  and who withdrew — you have to trust whoever holds the account.
- **Shared savings has no rules**: the account is in one person's name, and
  the rest of the family has no guarantees about who can withdraw how much.

Remesa Directa attacks each point with Stellar: fees of fractions of a
cent, confirmation in seconds, withdrawal rules and fundraising goals
**enforced by the contract / the network** (not by the app), and total
traceability on the public ledger.

## 5. Architecture

```
┌────────────────────┐       ┌─────────────────────────────────┐
│  Frontend          │       │  Backend (Django + DRF)         │
│  React + Vite + TS │  API  │                                 │
│  Freighter (signs) │◄─────►│  payments/      Module 1        │
└─────────┬──────────┘       │  pools/         Module 2        │
          │ asks for XDR,    │  family_pools/  Module 3        │
          │ user signs       │  stellar_common/ helpers        │
          ▼                  └───────┬─────────────┬───────────┘
┌────────────────────┐               │             │
│  User signs        │               ▼             ▼
│  with Freighter    │    ┌──────────────────┐  ┌──────────────────┐
└─────────┬──────────┘    │  Stellar Testnet │  │  Postgres (Neon) │
          │ backend       │  Horizon (payments,│ │  metadata only:  │
          │ validates XDR │  accounts, multi- │  │  notes, titles,  │
          │ and submits   │  sig) + Soroban   │  │  categories      │
          ▼               │  RPC              │  └──────────────────┘
┌─────────────────────────────────────────────┐
│  Soroban contracts                          │
│  vault_contract/ (Rust)  → donation vault   │
│  Blend pool              → savings yield    │
└─────────────────────────────────────────────┘
```

**Transaction flow, in all modules:**

1. The frontend asks the backend to **build the unsigned transaction** (XDR).
2. The user **signs it with their wallet** (Freighter) — the backend never
   sees a private key.
3. The frontend sends the signed XDR to the backend, which **re-validates**
   it against what was expected before submitting (it never trusts what the
   client says the transaction does — it re-checks the actual operations).
4. The backend **submits it to the network** (Horizon or Soroban RPC).
5. The **Stellar ledger is the single source of truth** for amounts and
   states; Postgres (Neon) stores only what the blockchain doesn't have
   (notes, categories, pool title).

**Security / non-custody:**

- The backend **never** generates, sees or stores a private key.
- All transactions are signed client-side.
- The family multisig and the vault contract enforce their authorization
  rules **on-chain**, not just at the API level.

## Tech stack

- **Backend**: Django 6 + Django REST Framework, Python 3.13.
- **Blockchain**: `stellar-sdk` (Python) against **Horizon testnet**
  (payments, accounts, multisig) and **Soroban RPC testnet** (vault
  contract, Blend). There is no official Blend SDK in Python, so the calls
  are hand-built against the contract's public spec.
- **Own contract**: Soroban (Rust) for the donation vault.
- **Database**: PostgreSQL on **Neon** (serverless), metadata only.
- **Frontend**: React + Vite + TypeScript, Freighter for signing.
- **Deploy**: Render (backend, free plan, gunicorn + whitenoise) and Vercel
  (frontend).

## Contracts on testnet

| Contract | ID (Testnet) | Role |
|---|---|---|
| Donation vault (own, Rust/Soroban) | `CCIXECDJABDC3Y6TBDBTTR4I773AFONQVMJZZRUE4ZRV6DRDVEFWA4OH` | Module 2: custodies the pools, enforces goals/withdrawal rules, leaderboard |
| Blend pool (lending) | `CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF` | Module 3: family savings box yield |

The own contract's code is in `vault_contract/` (Rust), with its tests in
`vault_contract/src/test.rs` and an end-to-end check in
`vault_contract/e2e_check.py`.

## Running the project locally

### Backend (Django)

```bash
cd backend_django
cp .env.example .env   # fill in the variables (table below)
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Required environment variables (`backend_django/.env`, see `.env.example`):

| Variable | Purpose |
|---|---|
| `DJANGO_SECRET_KEY` | Django secret key (any random string in dev) |
| `DJANGO_DEBUG` | `true` locally, `false` in production |
| `DJANGO_ALLOWED_HOSTS` | allowed hosts (`localhost,127.0.0.1` in dev) |
| `DATABASE_URL` | Postgres connection (Neon), format `postgresql://...` |
| `STELLAR_HORIZON_URL` | `https://horizon-testnet.stellar.org` |
| `STELLAR_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` |
| `STELLAR_SOROBAN_RPC_URL` | `https://soroban-testnet.stellar.org` |
| `BLEND_POOL_CONTRACT_ID` | `CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF` |
| `VAULT_CONTRACT_ID` | `CCIXECDJABDC3Y6TBDBTTR4I773AFONQVMJZZRUE4ZRV6DRDVEFWA4OH` |
| `CORS_ALLOW_ALL_ORIGINS` | `true` in dev so the frontend can hit it freely |

### Frontend (React)

```bash
cd frontend
npm install
npm run dev
```

The frontend hits `http://127.0.0.1:8000` by default (Vite proxy);
configurable via `VITE_API_URL` (see `frontend/.env.example`).

### Tests

```bash
cd backend_django
python manage.py test
```

73 automated tests, all passing. The three modules were also tested live
against testnet, including the rejection paths (self-donation blocked,
withdrawing more than donated blocked, non-owner trying to add a signer
blocked, etc.).

## Status / next steps

- All three modules complete and tested live against testnet.
- Backend deployed and running on Render; frontend on Vercel.
- **Pending**: real authentication (today access control is based on the
  public key declared in the request, not on a cryptographic signature
  verified on every call — it works because the multisig and the contract
  still require the real signature to move funds, but it's a UX/visualization
  layer, not funds authorization) and the move to **mainnet**.
