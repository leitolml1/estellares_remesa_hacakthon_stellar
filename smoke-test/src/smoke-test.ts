/**
 * Smoke test: valida que Friendbot + Horizon testnet responden bien
 * y que un path_payment_strict_send se puede armar, firmar y confirmar
 * end-to-end, antes de levantar el scaffold de NestJS.
 *
 * Uso: npm install && npm run test:stellar
 */
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

const HORIZON_URL = "https://horizon-testnet.stellar.org";
const SEND_AMOUNT = "50";
const DEST_MIN = "50"; // sin conversion de asset, min = amount enviado

function log(step: string, detail?: unknown) {
  console.log(`\n[${new Date().toISOString()}] ${step}`);
  if (detail !== undefined) console.log(detail);
}

async function fundAccount(server: Horizon.Server, publicKey: string) {
  const response = await server.friendbot(publicKey).call();
  return response;
}

async function main() {
  const server = new Horizon.Server(HORIZON_URL);

  log("1) Generando keypairs de origen y destino...");
  const source = Keypair.random();
  const destination = Keypair.random();
  console.log({ source: source.publicKey(), destination: destination.publicKey() });

  log("2) Fondeando ambas cuentas via Friendbot...");
  await Promise.all([
    fundAccount(server, source.publicKey()),
    fundAccount(server, destination.publicKey()),
  ]);
  log("   Friendbot OK");

  log("3) Cargando cuenta de origen desde Horizon...");
  const account = await server.loadAccount(source.publicKey());
  log("   Sequence number:", account.sequenceNumber());

  log("4) Armando transaccion con path_payment_strict_send (XLM -> XLM, sin path)...");
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.pathPaymentStrictSend({
        sendAsset: Asset.native(),
        sendAmount: SEND_AMOUNT,
        destination: destination.publicKey(),
        destAsset: Asset.native(),
        destMin: DEST_MIN,
      }),
    )
    .setTimeout(30)
    .build();

  log("5) Firmando con la keypair de origen (simula la firma client-side de Freighter)...");
  tx.sign(source);

  log("6) Enviando transaccion a Horizon...");
  const result = await server.submitTransaction(tx);
  log("   Resultado:", {
    hash: result.hash,
    successful: result.successful,
    ledger: result.ledger,
  });

  log("7) Verificando balance final de la cuenta destino...");
  const destAccount = await server.loadAccount(destination.publicKey());
  const nativeBalance = destAccount.balances.find((b) => b.asset_type === "native");
  console.log({ balance: nativeBalance?.balance });

  log("SMOKE TEST OK: Friendbot + Horizon testnet + path_payment_strict_send funcionan correctamente.");
}

main().catch((err) => {
  console.error("\nSMOKE TEST FALLO:");
  if (err?.response?.data) {
    console.error(JSON.stringify(err.response.data, null, 2));
  } else {
    console.error(err);
  }
  process.exit(1);
});
