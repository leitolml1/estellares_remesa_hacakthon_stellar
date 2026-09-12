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
