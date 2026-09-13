/**
 * Flujo de referencia end-to-end: Freighter + backend real.
 *
 * ESTO NO ES UN TEST AUTOMATIZADO. Necesita:
 * - Un navegador real con la extension de Freighter instalada y una cuenta
 *   de testnet cargada (usar Friendbot para fondearla).
 * - El backend de NestJS corriendo (ver ../backend).
 *
 * Por eso no corre en CI ni con `node`/`tsx` (Freighter es una extension
 * de navegador, depende de `window`). Para probarlo de verdad:
 *
 *   1. cd client && npm run build:e2e   (bundlea esto + stellar-client.ts
 *      para el browser con esbuild)
 *   2. cd backend && npm run start      (o node dist/main.js)
 *   3. cd client && npm run serve:e2e   (levanta client/e2e.html en
 *      http://localhost:5500)
 *   4. Abrir http://localhost:5500/e2e.html en un navegador con Freighter,
 *      completar la public key de destino (otra cuenta testnet fondeada
 *      por Friendbot) y click en "Correr flujo".
 *
 * Quien integre el frontend real deberia poder copiar esta funcion casi
 * tal cual y solo cambiar de donde vienen backendUrl/paymentRequest.
 */
import {
  connectFreighter,
  signTransactionWithFreighter,
} from './stellar-client';

/** Mismo default que backend/src/stellar/stellar.constants.ts (testnet). */
export const TESTNET_NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';

export interface PaymentAssetInput {
  code: string;
  issuer?: string;
}

export interface FreighterFlowOptions {
  backendUrl: string;
  networkPassphrase: string;
  paymentRequest: {
    destinationPublicKey: string;
    sendAsset: PaymentAssetInput;
    sendAmount: string;
    destAsset: PaymentAssetInput;
    destMin: string;
    memo?: string;
  };
  /** Callback para loggear cada paso (la UI real puede renderizarlo). */
  onStep?: (step: string) => void;
}

export interface FreighterFlowResult {
  publicKey: string;
  xdr: string;
  signedXdr: string;
  submitResult: { hash: string; ledger: number };
  historyRecordCount: number;
}

export async function runFreighterFlow(
  options: FreighterFlowOptions,
): Promise<FreighterFlowResult> {
  const log = options.onStep ?? (() => {});

  // PASO 1: conectar Freighter.
  // 👉 POPUP #1 (solo la primera vez): Freighter le pregunta al usuario si
  // quiere autorizar esta app. Si ya la autorizo antes, requestAccess()
  // resuelve directo con la public key, sin popup.
  log('1) Conectando con Freighter...');
  const { publicKey } = await connectFreighter();
  log(`   Conectado: ${publicKey}`);

  // PASO 2: pedirle al backend el XDR sin firmar.
  // Sin popup: es un fetch normal. El backend arma la tx contra Horizon
  // (incluye fee dinamico + sequence number actual) pero nunca la firma.
  log('2) POST /stellar/payments/build...');
  const buildRes = await fetch(`${options.backendUrl}/stellar/payments/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourcePublicKey: publicKey,
      destinationPublicKey: options.paymentRequest.destinationPublicKey,
      sendAsset: options.paymentRequest.sendAsset,
      sendAmount: options.paymentRequest.sendAmount,
      destAsset: options.paymentRequest.destAsset,
      destMin: options.paymentRequest.destMin,
      memo: options.paymentRequest.memo,
    }),
  });
  if (!buildRes.ok) {
    throw new Error(`build fallo: ${buildRes.status} ${await buildRes.text()}`);
  }
  const { xdr } = (await buildRes.json()) as { xdr: string };
  log(`   XDR recibido (${xdr.length} caracteres)`);

  // PASO 3: firmar con Freighter.
  // 👉 POPUP #2 (siempre): el popup de firma. El usuario ve el detalle de
  // la operacion (path payment, monto, destino, red) y aprueba o rechaza.
  // Si rechaza, signTransactionWithFreighter tira FreighterSignatureRejectedError.
  log('3) Pidiendole a Freighter que firme...');
  const { signedXdr } = await signTransactionWithFreighter(
    xdr,
    options.networkPassphrase,
  );
  log('   Tx firmada por el usuario.');

  // PASO 4: mandar el XDR firmado al backend para el submit a Horizon.
  // Sin popup: el backend recibe unicamente el resultado ya firmado, en
  // ningun momento tuvo ni ve la private key del usuario.
  log('4) POST /stellar/payments/submit...');
  const submitRes = await fetch(
    `${options.backendUrl}/stellar/payments/submit`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signedXdr }),
    },
  );
  if (!submitRes.ok) {
    throw new Error(`submit fallo: ${submitRes.status} ${await submitRes.text()}`);
  }
  const submitResult = (await submitRes.json()) as {
    hash: string;
    ledger: number;
  };
  log(`   Confirmada: hash=${submitResult.hash} ledger=${submitResult.ledger}`);

  // PASO 5: confirmar que aparece en el historial del propio emisor.
  log('5) GET /stellar/payments/:publicKey...');
  const historyRes = await fetch(
    `${options.backendUrl}/stellar/payments/${publicKey}?limit=5`,
  );
  if (!historyRes.ok) {
    throw new Error(
      `history fallo: ${historyRes.status} ${await historyRes.text()}`,
    );
  }
  const historyBody = (await historyRes.json()) as {
    records: unknown[];
    nextCursor: string | null;
  };
  log(`   ${historyBody.records.length} record(s) en el historial.`);

  return {
    publicKey,
    xdr,
    signedXdr,
    submitResult,
    historyRecordCount: historyBody.records.length,
  };
}

export interface SupplyToBlendOptions {
  backendUrl: string;
  networkPassphrase: string;
  familyPoolId: string;
  amount: string;
  onStep?: (step: string) => void;
}

export interface SupplyToBlendResult {
  publicKey: string;
  xdr: string;
  signedXdr: string;
  submitResult: { hash: string; ledger: number };
}

/**
 * Supply a Blend desde la wallet del family pool. Paso explicito (no
 * automatico post-deposito, ver comentario en FamilyPoolsService), asi que
 * el flujo es el mismo patron build -> firma -> submit de siempre.
 */
export async function runSupplyToBlendFlow(
  options: SupplyToBlendOptions,
): Promise<SupplyToBlendResult> {
  const log = options.onStep ?? (() => {});

  log('1) Conectando con Freighter...');
  const { publicKey } = await connectFreighter();
  log(`   Conectado: ${publicKey}`);

  // Sin popup: el backend arma la operacion de Blend (offline) y la
  // simula/prepara contra el RPC de Soroban para popular el SorobanData.
  log('2) POST /family-pools/:id/deposits/build-supply-to-blend...');
  const buildRes = await fetch(
    `${options.backendUrl}/family-pools/${options.familyPoolId}/deposits/build-supply-to-blend`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: options.amount }),
    },
  );
  if (!buildRes.ok) {
    throw new Error(
      `build-supply-to-blend fallo: ${buildRes.status} ${await buildRes.text()}`,
    );
  }
  const { xdr } = (await buildRes.json()) as { xdr: string };
  log(`   XDR recibido (${xdr.length} caracteres)`);

  // 👉 POPUP: Freighter muestra la invocacion al contrato de Blend
  // (invokeHostFunction), no un Payment clasico -- el detalle que muestra
  // el popup se ve distinto al de un pago normal.
  log('3) Pidiendole a Freighter que firme el supply...');
  const { signedXdr } = await signTransactionWithFreighter(
    xdr,
    options.networkPassphrase,
  );
  log('   Tx firmada.');

  // Reusa el endpoint generico de submit de family-pools: es un wrapper
  // fino sobre stellarService.submitSignedTx, agnostico al tipo de
  // operacion que trae el XDR (Payment, setOptions, invokeHostFunction).
  log('4) POST /family-pools/withdrawals/submit (submit generico)...');
  const submitRes = await fetch(
    `${options.backendUrl}/family-pools/withdrawals/submit`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signedXdr }),
    },
  );
  if (!submitRes.ok) {
    throw new Error(
      `submit fallo: ${submitRes.status} ${await submitRes.text()}`,
    );
  }
  const submitResult = (await submitRes.json()) as {
    hash: string;
    ledger: number;
  };
  log(`   Confirmada: hash=${submitResult.hash} ledger=${submitResult.ledger}`);

  return { publicKey, xdr, signedXdr, submitResult };
}

export interface WithdrawWithBlendOptions {
  backendUrl: string;
  networkPassphrase: string;
  familyPoolId: string;
  destinationPublicKey: string;
  amount: string;
  onStep?: (step: string) => void;
}

export interface WithdrawWithBlendResult {
  publicKey: string;
  redeemXdr: string | null;
  paymentXdr: string;
  signedRedeemXdr: string | null;
  signedPaymentXdr: string;
  redeemSubmitResult: { hash: string; ledger: number } | null;
  paymentSubmitResult: { hash: string; ledger: number };
}

/**
 * Retiro con Blend habilitado: build devuelve DOS xdrs (redeemXdr +
 * paymentXdr). A PROPOSITO se firman AMBOS antes de someter cualquiera
 * (en vez de firmar y enviar uno por uno) -- es el caso mas exigente para
 * probar que el encadenamiento manual de sequence number (hecho en
 * FamilyPoolsService.buildWithdrawalTx incrementando el mismo objeto
 * Account entre un build y el otro) aguanta aunque el usuario firme todo
 * de entrada. La firma en si NO toca el seqNum (ya quedo fijado en el XDR
 * al momento del build en el backend): lo que importa es que el ORDEN DE
 * SUBMIT sea redeem primero, payment despues, porque Horizon exige que el
 * seqNum sometido coincida con la sequence on-chain ACTUAL de la cuenta en
 * ese momento.
 */
export async function runWithdrawWithBlendFlow(
  options: WithdrawWithBlendOptions,
): Promise<WithdrawWithBlendResult> {
  const log = options.onStep ?? (() => {});

  log('1) Conectando con Freighter...');
  const { publicKey } = await connectFreighter();
  log(`   Conectado: ${publicKey}`);

  log('2) POST /family-pools/:id/withdrawals/build...');
  const buildRes = await fetch(
    `${options.backendUrl}/family-pools/${options.familyPoolId}/withdrawals/build`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destinationPublicKey: options.destinationPublicKey,
        amount: options.amount,
      }),
    },
  );
  if (!buildRes.ok) {
    throw new Error(
      `withdrawals/build fallo: ${buildRes.status} ${await buildRes.text()}`,
    );
  }
  const { redeemXdr, paymentXdr } = (await buildRes.json()) as {
    redeemXdr: string | null;
    paymentXdr: string;
  };
  log(
    `   redeemXdr=${redeemXdr ? `${redeemXdr.length} chars` : 'null (pool sin Blend habilitado)'}, paymentXdr=${paymentXdr.length} chars`,
  );

  let signedRedeemXdr: string | null = null;
  if (redeemXdr) {
    // 👉 POPUP 1/2: firma del redeem en Blend (invokeHostFunction).
    log('3) Firmando redeemXdr con Freighter (popup 1/2)...');
    signedRedeemXdr = (
      await signTransactionWithFreighter(redeemXdr, options.networkPassphrase)
    ).signedXdr;
    log('   redeemXdr firmado.');
  }

  // 👉 POPUP 2/2: firma del Payment. OJO, esto pasa ANTES de someter
  // redeemXdr -- es intencional, ver comentario arriba de la funcion.
  log(
    '4) Firmando paymentXdr con Freighter (popup 2/2, SIN haber sometido redeemXdr todavia)...',
  );
  const { signedXdr: signedPaymentXdr } = await signTransactionWithFreighter(
    paymentXdr,
    options.networkPassphrase,
  );
  log('   paymentXdr firmado.');

  let redeemSubmitResult: { hash: string; ledger: number } | null = null;
  if (signedRedeemXdr) {
    log('5) Sometiendo redeemXdr (POST /family-pools/withdrawals/submit)...');
    const redeemSubmitRes = await fetch(
      `${options.backendUrl}/family-pools/withdrawals/submit`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedXdr: signedRedeemXdr }),
      },
    );
    if (!redeemSubmitRes.ok) {
      throw new Error(
        `submit redeemXdr fallo: ${redeemSubmitRes.status} ${await redeemSubmitRes.text()}`,
      );
    }
    redeemSubmitResult = (await redeemSubmitRes.json()) as {
      hash: string;
      ledger: number;
    };
    log(
      `   redeem confirmado: hash=${redeemSubmitResult.hash} ledger=${redeemSubmitResult.ledger}`,
    );
  }

  log(
    '6) Sometiendo paymentXdr (recien ahora, despues de que redeemXdr ya se confirmo)...',
  );
  const paymentSubmitRes = await fetch(
    `${options.backendUrl}/family-pools/withdrawals/submit`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signedXdr: signedPaymentXdr }),
    },
  );
  if (!paymentSubmitRes.ok) {
    throw new Error(
      `submit paymentXdr fallo: ${paymentSubmitRes.status} ${await paymentSubmitRes.text()}`,
    );
  }
  const paymentSubmitResult = (await paymentSubmitRes.json()) as {
    hash: string;
    ledger: number;
  };
  log(
    `   payment confirmado: hash=${paymentSubmitResult.hash} ledger=${paymentSubmitResult.ledger}`,
  );

  return {
    publicKey,
    redeemXdr,
    paymentXdr,
    signedRedeemXdr,
    signedPaymentXdr,
    redeemSubmitResult,
    paymentSubmitResult,
  };
}
