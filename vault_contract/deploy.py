"""Deploy reproducible del vault comunitario a testnet.

Pasos:
  1. cargo build --target wasm32v1-none --release  (requere el toolchain
     windows-gnu + target wasm32v1-none; ver README del repo)
  2. stellar contract deploy con la identity `remesa-vault` (crear con
     `stellar keys generate remesa-vault` + `stellar keys fund
     remesa-vault --network testnet` la primera vez)
  3. Inicializa el constructor via SDK con los SACs de XLM/USDC/EURC y las
     tasas referenciales (1/10/11 - igual que CIRCLE_TESTNET_XLM_REFERENCE_RATES
     de stellar_common/assets.py). El CLI no ejecuta el __constructor, por
     eso se llama aparte.
  4. Imprime el nuevo VAULT_CONTRACT_ID - hay que actualizarlo en
     backend_django/.env.

Correr con el venv de backend_django:
  ..\backend_django\.venv\Scripts\python.exe deploy.py
"""

import subprocess
import sys
import time

import requests
from stellar_sdk import Asset, Keypair, Network, TransactionBuilder
from stellar_sdk.contract import ContractClient
from stellar_sdk.soroban_rpc import GetTransactionStatus, SendTransactionStatus
from stellar_sdk.soroban_server import SorobanServer
from stellar_sdk import scval

STELLAR_CLI = r"C:\Program Files (x86)\Stellar CLI\stellar.exe"
IDENTITY = "remesa-vault"
NETWORK = "testnet"
NETWORK_PASSPHRASE = Network.TESTNET_NETWORK_PASSPHRASE
RPC_URL = "https://soroban-testnet.stellar.org"
WASM = "target/wasm32v1-none/release/community_vault.wasm"

RATES = {"XLM": 1, "USDC": 10, "EURC": 11}
CIRCLE_ISSUERS = {
    "USDC": "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    "EURC": "GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO",
}


def sac_for(code: str) -> str:
    if code == "XLM":
        return Asset.native().contract_id(NETWORK_PASSPHRASE)
    return Asset(code, CIRCLE_ISSUERS[code]).contract_id(NETWORK_PASSPHRASE)


def main() -> int:
    print("== 1/3 cargo build (wasm32v1-none) ==")
    subprocess.run(["cargo", "build", "--target", "wasm32v1-none", "--release"], check=True)

    print("== 2/3 stellar contract deploy ==")
    import secrets

    salt = secrets.token_hex(16)
    deploy = subprocess.run(
        [
            STELLAR_CLI, "contract", "deploy",
            "--wasm", WASM,
            "--source", IDENTITY,
            "--network", NETWORK,
            "--salt", salt,
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    contract_id = deploy.stdout.strip().splitlines()[-1]
    print(f"deployado: {contract_id}")

    print("== 3/3 constructor (SACs + tasas referenciales) ==")
    signer = Keypair.random()
    requests.get(f"https://friendbot.stellar.org/?addr={signer.public_key}", timeout=20).raise_for_status()

    client = ContractClient(
        contract_id=contract_id, rpc_url=RPC_URL, network_passphrase=NETWORK_PASSPHRASE
    )
    assets = scval.to_vec([scval.to_address(sac_for(code)) for code in RATES])
    rates = scval.to_vec([scval.to_int128(RATES[code]) for code in RATES])
    assembled = client.invoke(
        "constructor", parameters=[assets, rates],
        source=signer.public_key, transaction_timeout=60,
    )
    envelope = TransactionBuilder.from_xdr(assembled.to_xdr(), NETWORK_PASSPHRASE)
    envelope.sign(signer)
    server = SorobanServer(RPC_URL)
    sent = server.send_transaction(envelope)
    assert sent.status != SendTransactionStatus.ERROR, sent.error_result_xdr
    for _ in range(20):
        time.sleep(3)
        tx = server.get_transaction(sent.hash)
        if tx.status == GetTransactionStatus.SUCCESS:
            break
        if tx.status == GetTransactionStatus.FAILED:
            raise SystemExit(f"el constructor fallo: {sent.hash}")
    else:
        raise SystemExit("el constructor no se confirmo a tiempo")

    print(f"\nVAULT_CONTRACT_ID={contract_id}")
    print("Actualiza backend_django/.env y reinicia Django.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
