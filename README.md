# Remesa Directa

Remesa Directa es una app para mandar dinero y ahorrar en familia usando
Stellar, sin que un banco o una billetera virtual se quede con comisión ni
retenga los fondos. Todo corre sobre la testnet de Stellar; el backend nunca
ve ni firma una clave privada — arma la transacción, el usuario la firma con
su wallet (Freighter) y recién ahí se manda a la red.

**Por qué Stellar**: comisiones de fracciones de centavo, confirmación en
segundos, y soporte nativo para stablecoins (USDC/EURC de Circle), multisig
de cuenta y contratos inteligentes (Soroban) — todo lo que necesitábamos para
los tres módulos sin tener que montar infraestructura propia de custodia.

- **Backend en producción**: `<COMPLETAR: URL de Render>`
- **Frontend en producción**: `<COMPLETAR: URL si está deployado>`
- **Red**: Stellar Testnet (Horizon + Soroban RPC)

## Los tres módulos

### 1. Pagos P2P con metadata

Mandar plata a otra wallet, en XLM, USDC o EURC, con nota y categoría de
gasto (algo que Stellar no guarda pero sí es útil para el usuario). Incluye:

- **Cotizador** (`GET /api/payments/quote/`): cuánto recibe el destinatario
  si mandás un asset y él necesita otro (ej. vos tenés XLM, tu mamá quiere
  USDC). Primero intenta el path real del DEX de Horizon; en testnet casi
  no hay liquidez, así que cae a una tasa referencial fija para no dejar al
  usuario sin cotización.
- **Historial** combinado: el ledger de Stellar es la fuente de verdad de
  monto/fecha/estado; Postgres solo guarda la nota/categoría y la cruza por
  hash de transacción.
- **Transferencias recurrentes** ("mandale a mamá cada mes"): sin custodia,
  el backend no puede debitar solo — guarda la regla (monto, frecuencia,
  próxima fecha) y el frontend le recuerda al usuario pagar con su wallet
  cuando vence.

### 2. Pools de donación comunitaria

Cualquiera dona a un pool escaneando un QR (URI SEP-7, la abre cualquier
wallet Stellar, no hace falta tener la app instalada). La donación se
custodia en un **contrato Soroban propio** (`vault_contract/`, Rust), no en
la wallet del creador del pool — reglas que se cumplen on-chain, no solo en
el backend:

- Si el pool ya llegó a la meta, el contrato rechaza donaciones nuevas.
- El dueño del pool no puede donarse a sí mismo.
- Solo el dueño puede retirar, y nunca más de lo que ese pool puntual
  recibió (aunque el contrato tenga fondos de otros pools).
- **Leaderboard de donantes** on-chain: ranking de quién donó más a cada
  pool, leído directo del contrato.

### 3. Caja de ahorro familiar (multisig + Blend)

Una cuenta Stellar compartida por una familia, con **multisig nativo** (no
un contrato — el mecanismo propio de Stellar de firmantes y umbrales):

- Firmantes con distinto rol: quien solo puede depositar, quien puede
  depositar y retirar, y umbrales que se ajustan solos al agregar/sacar
  gente.
- Límites de retiro configurables por asset (ej. "hasta 100 USDC por vez").
- Retiros necesitan juntar firmas de varios miembros antes de mandarse.
- **Yield con Blend Protocol**: la caja puede prestar su XLM/USDC al pool
  de lending de Blend en vez de quedarse quieto, y hay un endpoint de solo
  lectura que muestra capital vs. interés ganado, leyendo directo del
  contrato de Blend (no hay número inventado en una base de datos).

## Cómo está armado

```
frontend/         React + TypeScript (Vite), UI completa, conecta Freighter
backend_django/   Django + Django REST Framework, la API real
  payments/       Módulo 1
  pools/          Módulo 2 (+ cliente del contrato del vault)
  family_pools/   Módulo 3 (multisig + Blend)
  stellar_common/ helpers compartidos (cliente Horizon/Soroban, assets)
vault_contract/   Contrato Soroban (Rust) del Módulo 2, con sus tests
```

**Principio de diseño, en los tres módulos**: el backend arma la transacción
sin firmar (XDR), el usuario la firma en su wallet, el backend valida el XDR
firmado *antes* de mandarlo a la red (nunca confía en lo que el cliente dice
que la transacción hace — lo vuelve a chequear leyendo la operación real). El
ledger de Stellar (y, para el Módulo 2, el contrato Soroban) es la única
fuente de verdad de montos y estados; Postgres (Neon) guarda solo metadata
que la blockchain no tiene (notas, categorías, título del pool).

## Stack técnico

- **Backend**: Django 6 + DRF, Python 3.13.
- **Blockchain**: `stellar-sdk` (Python) para Horizon (pagos, multisig) y
  Soroban RPC (contrato del vault, Blend). Sin SDK oficial de Blend en
  Python, así que las llamadas se arman a mano contra la spec pública del
  contrato.
- **Contrato propio**: Soroban (Rust) para el vault de donaciones.
- **Base de datos**: Postgres (Neon, serverless).
- **Frontend**: React + Vite + TypeScript, Freighter para firmar.
- **Deploy**: Render (backend, plan free), gunicorn + whitenoise.

## Seguridad / no-custodia

- El backend **nunca** genera, ve ni guarda una clave privada.
- Todas las transacciones se firman client-side (Freighter u otra wallet
  compatible con Stellar).
- Cada endpoint de "submit" vuelve a validar la transacción firmada contra
  lo que se esperaba antes de mandarla a la red (protección contra que el
  cliente intente firmar algo distinto a lo que el backend armó).
- El multisig familiar y el contrato del vault enforcean sus reglas de
  autorización **on-chain**, no solo a nivel de API.

## Estado del proyecto

- **73 tests** automatizados (Django `manage.py test`), todos en verde.
- Los tres módulos probados en vivo contra testnet, incluyendo los caminos
  de rechazo (auto-donación bloqueada, retiro de más de lo donado
  bloqueado, no-dueño intentando agregar firmante bloqueado, etc.).
- Backend deployado y corriendo en Render.

## Correr el proyecto localmente

```bash
cd backend_django
cp .env.example .env   # completar DATABASE_URL (Postgres) y el resto
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

```bash
cd frontend
npm install
npm run dev
```

El frontend pega a `http://127.0.0.1:8000` por default (proxy de Vite);
configurable con `VITE_API_URL`.

## Qué falta / próximos pasos

- Autenticación real: hoy el control de acceso (ej. "quién es parte de esta
  familia") se basa en la clave pública declarada en el request, no en una
  firma criptográfica verificada en cada llamada — funciona porque el
  multisig y el contrato igual exigen la firma real para mover fondos, pero
  es una capa de UX/visualización, no de autorización de fondos.
- Mainnet: todo corre hoy contra testnet.
