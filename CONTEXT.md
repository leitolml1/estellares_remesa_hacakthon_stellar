# Remesa Directa — contexto técnico (backend + client)

Este documento resume qué se construyó hasta ahora, para que quien siga
(backend o frontend) no tenga que releer todo el historial de commits/chat.

> Estado: primer commit del proyecto. Todo lo de acá abajo está implementado,
> tipado estricto, con tests unitarios pasando y validado en vivo contra
> Horizon testnet (y contra un Postgres real para el módulo de pools).

## Stack

- **Backend**: NestJS 11 + TypeScript, `@stellar/stellar-sdk@17` para hablar
  con Horizon, TypeORM + Postgres para metadata (nunca para montos/estados:
  el ledger de Stellar es la fuente de verdad).
- **Firma de transacciones**: siempre client-side. El backend nunca ve, genera
  ni loguea una private key — solo recibe XDRs ya firmados.
- **Wallet de referencia**: Freighter (`@stellar/freighter-api@6`), pero el
  backend es agnóstico a qué wallet firmó.
- **Red**: Horizon testnet (`https://horizon-testnet.stellar.org`), Friendbot
  para fondear cuentas de prueba.
- **Test runner**: Vitest + SWC (no Jest — hubo un problema de interop
  ESM/CJS con una dependencia interna de `@stellar/stellar-sdk` que forzó la
  migración; ver detalle en la sección de gotchas).

## Estructura del repo

```
.
├── smoke-test/    # scripts standalone (no forman parte del backend/client)
│                  # para probar Horizon/Friendbot y para pegarle al backend
│                  # real desde afuera (e2e-backend-check.ts)
├── backend/       # API NestJS
│   └── src/
│       ├── stellar/   # Módulo 1: pagos directos + balances/trustlines
│       └── pools/     # Módulo 2: pools comunitarios (SEP-7 + Postgres)
└── client/        # Módulo cliente TS puro (sin frameworks de UI) para
                    # integrar Freighter. El frontend real lo importa/adapta.
```

## Cómo correr todo

### Backend

```bash
cd backend
cp .env.example .env   # completar credenciales de Postgres local
npm install
npm run start:dev
```

Necesita un Postgres corriendo (ver variables `DB_*` en `.env.example`).
`DB_SYNCHRONIZE=true` está pensado solo para este hackathon (no hay
migrations todavía — antes de un deploy real hay que agregarlas y poner
`DB_SYNCHRONIZE=false`).

```bash
npm run test        # unit tests (Vitest), no necesitan Postgres ni red
npm run test:e2e     # smoke test del AppController, tampoco necesita Postgres
npm run build        # nest build -> dist/
```

### Client (integración Freighter)

```bash
cd client
npm install
npm run build:e2e    # bundlea con esbuild para poder cargarlo en un navegador
npm run serve:e2e    # levanta client/e2e.html en http://localhost:5500
```

Abrir `http://localhost:5500/e2e.html` en un navegador **con la extensión
Freighter instalada** y una cuenta testnet fondeada (Friendbot) para probar
el flujo real de conexión + firma + submit + historial. Este flujo no corre
en CI (depende del popup real de la extensión).

## Backend — Módulo 1: `stellar/` (pagos directos)

Todo pasa por `path_payment_strict_send` (permite mandar un asset y que el
destinatario reciba otro, con protección de slippage vía `destMin`; para un
pago simple en el mismo asset, `sendAsset === destAsset` y listo).

### `StellarController` (`/stellar/payments`)

| Método | Ruta | Body/Query | Devuelve |
|---|---|---|---|
| `POST` | `/stellar/payments/build` | `BuildPaymentDto` (ver abajo) | `{ xdr: string }` (sin firmar) |
| `POST` | `/stellar/payments/submit` | `{ signedXdr: string }` | `{ hash: string, ledger: number }` |
| `GET` | `/stellar/payments/:publicKey?limit=&cursor=&memo=` | — | `{ records: PaymentRecordDto[], nextCursor: string \| null }` |

`BuildPaymentDto`:

```ts
{
  sourcePublicKey: string;   // G... del que envía (lo firma el cliente)
  destinationPublicKey: string;
  sendAsset: { code: string; issuer?: string };  // code "XLM" = nativo, sin issuer
  sendAmount: string;        // string, hasta 7 decimales
  destAsset: { code: string; issuer?: string };
  destMin: string;           // mínimo a recibir (protección de slippage)
  memo?: string;              // texto, máx 28 bytes
}
```

`PaymentRecordDto`: `{ id, from, to, amount, assetCode, assetIssuer?, memo?, createdAt, transactionHash }`.

**Importante para el frontend**: si `destAsset` no es nativo, `build` chequea
automáticamente si la cuenta destino tiene la trustline. Si no la tiene,
devuelve **422** con un mensaje explícito (`"La cuenta destino no tiene
trustline para {code}..."`) *antes* de armar cualquier XDR — evita un
roundtrip completo de build→firma→submit→error. El frontend puede (y
debería) chequear esto proactivamente antes con el endpoint de abajo.

### `StellarAccountsController` (`/stellar/accounts`)

| Método | Ruta | Devuelve |
|---|---|---|
| `GET` | `/stellar/accounts/:publicKey/balance` | `{ publicKey, balances: AssetBalanceDto[] }` |
| `GET` | `/stellar/accounts/:publicKey/trustline-check?assetCode=USDC&assetIssuer=G...` | `{ hasTrustline: boolean }` |

`AssetBalanceDto`: `{ assetType, assetCode?, assetIssuer?, balance, limit?, liquidityPoolId? }`.
`assetType` puede ser `'native' | 'credit_alphanum4' | 'credit_alphanum12' | 'liquidity_pool_shares'`
(esta última no tiene `assetCode`/`assetIssuer`, tiene `liquidityPoolId`).

### Manejo de errores (`mapHorizonError`, centralizado en `stellar.service.ts`)

| Situación | HTTP |
|---|---|
| Cuenta no fondeada / no existe | 404 |
| `tx_bad_seq` (sequence desactualizado) | 409, reintentar el build |
| Fondos insuficientes (`op_underfunded`) | 422 |
| Sin trustline (`op_no_trust`, o el chequeo preventivo de `build`) | 422 |
| Otro rechazo de Horizon | 400 |
| Horizon caído / timeout | 503 |

## Backend — Módulo 2: `pools/` (pools comunitarios)

Permite que cualquier wallet done a un pool escaneando un QR con un URI
SEP-7, **sin estar registrada en la app**. El truco: un memo de texto en
Stellar tiene ~28 bytes (no entra un UUID), así que se usa un `shortCode`
corto (`nanoid(10)`) que Postgres mapea al pool completo.

### `PoolsController` (`/pools`)

| Método | Ruta | Body/Query | Devuelve |
|---|---|---|---|
| `POST` | `/pools` | `CreatePoolDto` | `{ pool: Pool, paymentUri: string }` |
| `GET` | `/pools/:shortCode?amount=` | — | `{ pool: Pool, paymentUri: string }` (sin guard: cualquiera con el link tiene que poder verlo) |
| `GET` | `/pools/:id/donations?cursor=` | — | `{ records: PaymentRecordDto[], nextCursor: string \| null }` |

`CreatePoolDto`: `{ walletPublicKey: string; title: string; description?: string; goalAmount?: string }`.

`paymentUri` tiene esta forma (SEP-7, la puede abrir cualquier wallet
compatible, no solo Freighter — ej. Lobstr):

```
web+stellar:pay?destination=<walletPublicKey>&memo=<shortCode>&memo_type=MEMO_TEXT
```

Si se pasa `?amount=` en el `GET /pools/:shortCode`, se agrega `&amount=...`
al final. **Es opcional a propósito**: las donaciones son libres, así que
por default no se sugiere ningún monto — el frontend lo pasa solo si quiere
ofrecer explícitamente "donar X sugerido".

`GET /pools/:id/donations` reusa `stellarService.getTransactionHistory`
filtrando por el `memo` = `shortCode` del pool — es el mismo helper que usa
`/stellar/payments/:publicKey`, con la misma paginación por cursor.

## Client: integración Freighter (`client/src/`)

Módulo TS puro (sin React/Angular/etc.), pensado para que el frontend real
lo importe y adapte cuando arranque.

### `stellar-client.ts`

```ts
isFreighterAvailable(): Promise<boolean>
connectFreighter(): Promise<{ publicKey: string }>
signTransactionWithFreighter(xdr: string, networkPassphrase: string): Promise<{ signedXdr: string }>
```

Errores distinguibles (clases propias, no strings a comparar):

- `FreighterNotInstalledError` — la extensión no está instalada/detectada.
- `FreighterAccessDeniedError` — el usuario rechazó la conexión.
- `FreighterSignatureRejectedError` — el usuario canceló la firma en el popup
  (mostrar "cancelaste la firma", no un error genérico).
- `FreighterUnexpectedError` — cualquier otro error de Freighter (trae el
  error original adjunto en `.freighterError` para debug).

`signTransactionWithFreighter` **siempre** requiere pasarle el
`networkPassphrase` explícito (mismo valor que `STELLAR_NETWORK_PASSPHRASE`
del backend) — así Freighter avisa si la wallet del usuario está en otra red
en vez de firmar silenciosamente contra la red equivocada.

### `e2e-freighter-flow.ts` + `e2e.html`

Flujo de referencia documentado paso a paso (con comentarios de en qué paso
aparece cada popup de Freighter): conectar → `POST /build` → firmar →
`POST /submit` → `GET /:publicKey` para confirmar en el historial. `e2e.html`
es un harness sin frameworks para probarlo manualmente en un navegador real
(ver "Cómo correr todo" arriba).

## Pendiente / próximos pasos conocidos

- **Auth real**: los 3 controllers tienen comentarios `// TODO: JwtAuthGuard`
  en cada endpoint sensible. Hoy no hay ningún guard — cualquiera puede
  pegarle a `build`/`submit`/`donations`. El plan es un módulo `auth/` con
  challenge+verify firmado por wallet (mismo patrón que Freighter, agnóstico
  a cuál).
- **Migrations**: `DB_SYNCHRONIZE=true` es solo para dev/hackathon. Antes de
  cualquier ambiente real hay que agregar migrations de TypeORM.
- **Módulo 3**: todavía no arrancado (mencionado en la propuesta original de
  stack, no hay código).

## Gotchas que ya se resolvieron (para no repetir el problema)

- **Jest no podía cargar `@stellar/stellar-sdk`** (su build "CJS" importa
  internamente un paquete ESM puro). Se migró todo el test runner a
  **Vitest + SWC** (receta oficial de NestJS). No usar Jest en este backend.
- **`nanoid@5+` y `@stellar/freighter-api` son ESM-only** — funcionan
  transparentes con la config actual de Vitest, no hace falta tocar nada.
- **`AssetType` del SDK tiene 4 variantes, no 3**: además de `native` /
  `credit_alphanum4` / `credit_alphanum12` existe `liquidity_pool_shares`
  (sin `assetCode`/`assetIssuer`, con `liquidityPoolId`). Si tocás
  `AssetBalanceDto` o el mapeo de balances, tenelo en cuenta.
- **`@stellar/freighter-api` no exporta `getPublicKey()`** en la versión
  instalada (v6) — es `getAddress()` / `requestAccess()`, ambas devuelven
  `{ address }`. Tampoco exporta el tipo `FreighterApiError` desde su
  entrypoint público.
