# Qué probar hoy + guía de pitch para Esteban

Producto: **Remesa Directa** (BAF × Stellar, Track Genesis).

- Frontend: https://frontend-estellares.vercel.app/
- API: https://estellares-remesa-hacakthon-stellar.onrender.com
- Red: **Stellar Testnet** (Freighter tiene que estar en Test Network, no Mainnet)

---

## Parte 1 — Qué tiene que probar Leonel hoy

Objetivo: confirmar que lo deployado no está roto **antes** de que Esteban grabe. No hace falta probar cada rechazo on-chain; sí hace falta que los tres módulos se vean vivos en producción.

### Setup (5 min)

1. Chrome/Brave + extensión **Freighter**.
2. En Freighter: Network → **Test Network**.
3. Ideal: **dos cuentas** testnet con XLM del Friendbot (una “quien manda”, otra “familia / destinatario”).
4. USDC/EURC: si la cuenta no tiene trustline, Recibir/Enviar lo van a decir. Activar el asset en Freighter **antes** de pedir USDC.
5. Render free se duerme. Si la primera request tarda 30–50 s, esperá; no es un bug de la UI. Si queda en error, recargá.

Chequeo rápido de API (en el navegador o curl):

```
https://estellares-remesa-hacakthon-stellar.onrender.com/api/payments/quote/?send_asset=XLM&dest_asset=USDC&send_amount=10
```

Tiene que devolver JSON con `rate` / `destAmount` (no HTML 502).

### Checklist — Módulo 1 (pagos)

En https://frontend-estellares.vercel.app/

- [ ] Home carga, badge **Testnet** visible, CTA conecta Freighter.
- [ ] **Enviar** mismo asset (XLM → XLM): arma, popup de Freighter, hash, link al explorer.
- [ ] **Enviar** con cambio (XLM → USDC): aparece cotización (`DEX` o `referencial`). No debe dejar firmar sin cotización.
- [ ] Nota opcional: el pago se confirma igual aunque la nota falle (está on-chain).
- [ ] **Recibir**: QR + copiar address. Si pedís USDC sin trustline, sale el aviso.
- [ ] **Historial**: aparece el pago (el ledger es la fuente de verdad).
- [ ] **/track/{hash}**: abre el tx del explorer / detalle.
- [ ] **Perfil → Más**: contactos y **transferencia recurrente** (alta / lista). No tiene que debitar sola: es un recordatorio, no custodia.

Si algo de esto falla, anotá: ¿Freighter? ¿Render dormido? ¿trustline? ¿cuenta sin XLM?

### Checklist — Módulo 2 (pools / vault Soroban)

- [ ] **Pools → Nuevo**: título + meta. Tras crear, Freighter pide **registrar el vault** (segunda firma). Si esa firma falla, el pool existe en Postgres pero no en el contrato: reintentar el alta, no crear otro.
- [ ] Copiar short code / link. Buscador de la nav (lupa) abre `/pools/{code}`.
- [ ] Donar desde **otra** wallet (si hay una sola, doná igual y avisale a Esteban).
- [ ] El detalle muestra progreso, donaciones y **leaderboard**.
- [ ] Como dueño: retiro no mayor a lo donado a *ese* pool.
- [ ] (Opcional, 1 min) Donar a un pool propio: el contrato tiene que rechazar auto-donación.

### Checklist — Módulo 3 (familia + Blend)

Esto es lo más largo. Hoy, si ya hay una caja en testnet, **no crees otra**: abrir **Familia**, elegir la existente.

- [ ] Lista de cajas de la wallet conectada.
- [ ] Depósito XLM (o USDC si hay trustline en la cuenta del pool).
- [ ] QR de depósito para el otro familiar.
- [ ] Retiro: pide más de una firma. Con una sola wallet tiene que decir “faltan firmas”, no “error genérico”.
- [ ] **Blend**: ver posición (capital vs interés). Supply chico de XLM si hay tiempo. El número tiene que venir del contrato, no de un mock.

Crear una caja nueva **solo si** no hay ninguna usable para el video (CreateAccount + configurar firmantes = varias firmas Freighter). Dejala lista para Esteban.

### Qué NO perder tiempo hoy

- Mainnet.
- Auth “de verdad” (el README ya dice que la API identifica por public key declarada; los fondos igual se mueven solo con firma on-chain).
- Tests de Django (`manage.py test`): ya están; hoy es smoke de producción.
- El Nest viejo: Esteban lo borró del repo. El backend es `backend_django`.

Anotá en un mensaje para Esteban: URLs, short code del pool demo, public keys de las dos wallets, y si Blend ya tiene posición.

---

## Parte 2 — Guía de pitch / video para Esteban

Duración sugerida: **2:30 a 4:00**. Jurado de hackathon: problema → por qué Stellar → demo de los 3 módulos → no-custodia.

### Antes de grabar (el día anterior, no en cámara)

1. Freighter en **Test Network**, dos cuentas con XLM (y USDC si vas a mostrar cambio).
2. Un **pool comunitario ya creado y registrado en el vault**, con 1–2 donaciones y leaderboard con nombres.
3. Una **caja familiar ya armada** con 2 firmantes. Un retiro a medio firmar queda muy bien en cámara (mostrás “faltan firmas” y después la segunda).
4. Abrí el frontend y pegale un GET a la API 1 minuto antes: despertás Render.
5. Cerrá notificaciones, zoom 110–125%, Freighter que no tape el stepper.
6. Tené Stellar Expert (testnet) en una pestaña para el hash, no para vivir ahí.

### Guion (podés leerlo; no hace falta recitar)

**0:00–0:35 — El problema (sin cripto todavía)**  
Mandar plata a la familia o juntar para una causa hoy es banco o billetera: comisión, días, a veces retienen. Remesa Directa es eso mismo sobre Stellar: llega en segundos, cuesta fracciones de centavo, y **la app nunca toca tus claves**.

**0:35–1:00 — Por qué Stellar (esto es el pitch técnico, no “usamos blockchain”)**  
Tres cosas nativas que no inventamos:

- Stablecoins (USDC/EURC de Circle) + XLM.
- Multisig de cuenta (Módulo 3): no es un contrato nuestro, es el mecanismo de Stellar.
- Soroban (Módulo 2): reglas del pool on-chain, no un `if` en Django.

El backend **arma el XDR, no firma**. Freighter firma. Antes de submit, Django **relee la operación firmada** y la compara con lo que se esperaba. Postgres (Neon) guarda notas/títulos; montos y estados salen del ledger.

**1:00–1:50 — Demo M1: mandar a mamá**  
Pantalla Enviar. Destino de la segunda wallet. Monto chico. Si da tiempo: “ella quiere USDC, yo tengo XLM” → se ve la cotización. Firmar. Hash. Historial. Frase: *el pago ya está en Stellar aunque la nota no se haya guardado*.

**1:50–2:40 — Demo M2: la colecta**  
Abrí el pool **ya creado**. QR / short code. Doná con la segunda wallet. Leaderboard. Una frase de las reglas: *si ya llegó a la meta, el contrato rechaza; el dueño no puede donarse a sí mismo; no puede retirar más de lo que ese pool recibió*. Mostrá que el vault es **contrato propio** (`vault_contract/`), no la wallet del creador.

**2:40–3:30 — Demo M3: la caja familiar**  
Abrí la caja. “Acá no hay un admin invisible: para sacar hace falta más de una firma, on-chain.” Mostrá depósito y el retiro a dos firmas. Si Blend está vivo: “la plata no queda quieta, va al pool de lending de Blend; el interés se lee del contrato, no lo inventamos en la base.”

**3:30–4:00 — Cierre**  
Tres módulos, los tres contra testnet, 73 tests, API en Render, UI en Vercel. Lo que no hacemos: custodia, mainnet todavía, login con password. Lo que sí: quien tiene la Freighter mueve la plata.

### Qué mostrar / qué no mostrar

Mostrar:

- Badge Testnet (honestidad > “parece mainnet”).
- Popup de Freighter (prueba de no-custodia).
- Stepper: armando → firmando → enviando.
- Un hash en el explorer, **un** segundo, no un tour.

No mostrar:

- `localhost`, terminal, Django admin, `.env`.
- Crear la caja familiar desde cero (son 4+ firmas; aburre).
- Un 500 de Render. Si pasa, cortá, despertá la API, seguí.
- Números de yield inventados si Blend no responde: saltá esa pantalla.
- “Somos un banco” / “rendimientos garantizados”.

### Plan B si algo se cae en vivo

| Se rompe | Qué hacés |
|---|---|
| Render dormido / 502 | Esperá 40 s, recargá. Mientras, hablá no-custodia. |
| Freighter no aparece | Recargar. Test Network. |
| Cotización XLM→USDC fea | Mandá XLM→XLM. La frase de “path payment + fallback referencial” alcanza. |
| Vault register falla | Usá el pool que ya estaba registrado. |
| Blend timeout | Cerrá en multisig. Blend es plus, no el core del track. |
| Una sola wallet | Demo M1 + M2. M3 explicalo con la caja ya creada y “acá pediría la segunda firma”. |

### Frases que cierran bien (elegí 2)

- “El LLM o el backend no mueven un peso. Quien firma es el usuario.”
- “El pool no vive en la wallet del organizador: vive en un contrato.”
- “La familia usa el multisig que Stellar ya tiene, no un Excel de permisos.”
- “Postgres guarda la nota. Stellar guarda el dinero.”

### Material de apoyo (por si preguntan)

| Pregunta | Respuesta corta |
|---|---|
| ¿Dónde está el contrato? | `vault_contract/` (Rust / Soroban), ID en `render.yaml` (`VAULT_CONTRACT_ID`). |
| ¿Blend? | Pool de testnet; cliente Python armado a mano contra la spec (no hay SDK oficial). |
| ¿Por qué no Nest? | Lo sacamos: la API real es Django (`backend_django`). |
| ¿Auth? | Identidad de UI por public key; autorización de fondos = firma + reglas on-chain. |
| ¿Mainnet? | No. Testnet a propósito para el challenge. |

Cuando grabes, una sola toma continua de la demo (aunque el intro sea aparte) se ve más verdadero que un montaje de 12 cortes.
