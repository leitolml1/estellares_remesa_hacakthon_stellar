/**
 * Prueba end-to-end del modulo stellar de NestJS contra Horizon testnet:
 * fondea 2 cuentas, pide el XDR sin firmar al backend, firma en memoria
 * (simulando Freighter, la secret key nunca se loguea ni persiste),
 * lo envia de vuelta al backend para el submit, y verifica el historial.
 *
 * Uso: BACKEND_URL=http://localhost:3050 npx tsx src/e2e-backend-check.ts
 */
import { Keypair, Networks } from "@stellar/stellar-sdk";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3050";

async function main() {
  const source = Keypair.random();
  const destination = Keypair.random();

  console.log("1) Fondeando cuentas via Friendbot...");
  await Promise.all(
    [source.publicKey(), destination.publicKey()].map((pk) =>
      fetch(`https://friendbot.stellar.org?addr=${pk}`),
    ),
  );

  console.log("2) POST /stellar/payments/build");
  const buildRes = await fetch(`${BACKEND_URL}/stellar/payments/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourcePublicKey: source.publicKey(),
      destinationPublicKey: destination.publicKey(),
      sendAsset: { code: "XLM" },
      sendAmount: "25",
      destAsset: { code: "XLM" },
      destMin: "25",
      memo: "smoke-test",
    }),
  });
  if (!buildRes.ok) {
    throw new Error(`build fallo: ${buildRes.status} ${await buildRes.text()}`);
  }
  const { xdr } = (await buildRes.json()) as { xdr: string };
  console.log("   XDR recibido, longitud:", xdr.length);

  console.log("3) Firmando el XDR en memoria (simulando Freighter)...");
  const { TransactionBuilder } = await import("@stellar/stellar-sdk");
  const transaction = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
  transaction.sign(source);
  const signedXdr = transaction.toXDR();

  console.log("4) POST /stellar/payments/submit");
  const submitRes = await fetch(`${BACKEND_URL}/stellar/payments/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedXdr }),
  });
  if (!submitRes.ok) {
    throw new Error(`submit fallo: ${submitRes.status} ${await submitRes.text()}`);
  }
  const submitBody = await submitRes.json();
  console.log("   Resultado submit:", submitBody);

  console.log("5) GET /stellar/payments/:publicKey (historial del destino)");
  const historyRes = await fetch(
    `${BACKEND_URL}/stellar/payments/${destination.publicKey()}?limit=5`,
  );
  const historyBody = await historyRes.json();
  console.log("   Historial destino:", JSON.stringify(historyBody, null, 2));

  console.log("6) GET con memo filter ?memo=smoke-test (deberia devolver 1 record)");
  const filteredRes = await fetch(
    `${BACKEND_URL}/stellar/payments/${destination.publicKey()}?limit=5&memo=smoke-test`,
  );
  const filteredBody = (await filteredRes.json()) as {
    records: unknown[];
    nextCursor: string | null;
  };
  console.log(
    `   Records con memo=smoke-test: ${filteredBody.records.length} (esperado: 1)`,
  );
  if (filteredBody.records.length !== 1) {
    throw new Error("memoFilter no devolvio la cantidad esperada de records");
  }

  console.log("\nE2E OK: build -> firma en memoria -> submit -> history (con memoFilter) funcionan contra el backend real.");
}

main().catch((err) => {
  console.error("E2E FALLO:", err);
  process.exit(1);
});
