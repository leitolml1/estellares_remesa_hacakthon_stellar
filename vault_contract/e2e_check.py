"""E2E del vault comunitario contra testnet real, sin Freighter: crea
cuentas con Friendbot, firma directo con keypairs del SDK y ejercita el
contrato deployado (create_pool / deposit / withdraw / pool_info),
incluyendo los rechazos on-chain (meta cumplida, auto-donacion del owner).

Correr con el venv de backend_django:
  ..\backend_django\.venv\Scripts\python.exe e2e_check.py
"""

import sys
import time

import requests
from stellar_sdk import Asset, Keypair, Network, TransactionBuilder
from stellar_sdk.contract import ContractClient
from stellar_sdk.contract.exceptions import SimulationFailedError
from stellar_sdk.soroban_rpc import GetTransactionStatus, SendTransactionStatus
from stellar_sdk.soroban_server import SorobanServer

NETWORK_PASSPHRASE = Network.TESTNET_NETWORK_PASSPHRASE
RPC_URL = "https://soroban-testnet.stellar.org"
HORIZON_URL = "https://horizon-testnet.stellar.org"
FRIENDBOT = "https://friendbot.stellar.org"

VAULT_ID = "CATQKYDF53TJDHK5WHXAXUAKV4GMPDLIJY5BB3PCUHE5RO467JDVILJK"

STROOP = 10_000_000
POLL_ATTEMPTS = 20
POLL_DELAY = 3.0


def fund(keypair: Keypair) -> None:
    response = requests.get(f"{FRIENDBOT}/?addr={keypair.public_key}", timeout=20)
    response.raise_for_status()


def client() -> ContractClient:
    return ContractClient(
        contract_id=VAULT_ID,
        rpc_url=RPC_URL,
        network_passphrase=NETWORK_PASSPHRASE,
    )


def invoke_signed(fn_name: str, parameters: list, source: Keypair) -> dict:
    assembled = client().invoke(
        fn_name,
        parameters=parameters,
        source=source.public_key,
        transaction_timeout=60,
    )
    envelope = TransactionBuilder.from_xdr(assembled.to_xdr(), NETWORK_PASSPHRASE)
    envelope.sign(source)
    server = SorobanServer(RPC_URL)
    result = server.send_transaction(envelope)
    if result.status == SendTransactionStatus.ERROR:
        raise RuntimeError(f"la red rechazo la tx: {result.error_result_xdr}")
    return poll(server, result.hash)


def poll(server: SorobanServer, tx_hash: str) -> dict:
    for _ in range(POLL_ATTEMPTS):
        time.sleep(POLL_DELAY)
        result = server.get_transaction(tx_hash)
        if result.status == GetTransactionStatus.SUCCESS:
            return {"hash": tx_hash}
        if result.status == GetTransactionStatus.FAILED:
            raise RuntimeError(f"tx incluida pero fallida: {tx_hash}")
    raise RuntimeError(f"no se confirmo a tiempo: {tx_hash}")


def read(fn_name: str, parameters: list):
    return client().invoke(fn_name, parameters=parameters).result()


def xlm_balance(public_key: str) -> float:
    response = requests.get(f"{HORIZON_URL}/accounts/{public_key}", timeout=20)
    if response.status_code == 404:
        return 0.0
    response.raise_for_status()
    for balance in response.json()["balances"]:
        if balance["asset_type"] == "native":
            return float(balance["balance"])
    return 0.0


def main() -> int:
    native_sac = Asset.native().contract_id(NETWORK_PASSPHRASE)
    print(f"vault:    {VAULT_ID}")
    print(f"native SAC: {native_sac}")

    owner = Keypair.random()
    donor = Keypair.random()
    dest = Keypair.random()
    fund(owner)
    fund(donor)
    print(f"owner {owner.public_key[:10]}â€¦ / donor {donor.public_key[:10]}â€¦ fondeados")

    code_a = f"E2E{int(time.time()) % 10**7:07d}"
    code_b = f"E2E{(int(time.time()) + 1) % 10**7:07d}"

    # 1. create_pool: pool abierto con meta 5 XLM y pool "migrado" que nace
    # completo (meta 2, inicial 2).
    invoke_signed(
        "create_pool",
        [to_string(code_a), to_address(owner), to_int128(5 * STROOP), to_int128(0)],
        owner,
    )
    invoke_signed(
        "create_pool",
        [to_string(code_b), to_address(owner), to_int128(2 * STROOP), to_int128(2 * STROOP)],
        owner,
    )
    print("create_pool x2 OK")

    # 2. deposit de 3 XLM al pool abierto.
    invoke_signed(
        "deposit",
        [to_string(code_a), to_address(donor), to_address_str(native_sac), to_int128(3 * STROOP)],
        donor,
    )
    info = read("pool_info", [to_string(code_a)])
    native = scval_native(info)
    assert native["equivalent_total"] == 3 * STROOP, native
    assert native["complete"] is False, native
    assert native["assets"][0]["available"] == 3 * STROOP, native
    print("deposit 3 XLM OK ->", summarize(native))

    # 3. rechazo: owner auto-donandose. En el build release los mensajes
    # de panic se strippan (UnreachableCodeReached), asi que se valida que
    # la simulacion reviente, no el texto.
    try:
        invoke_signed(
            "deposit",
            [to_string(code_a), to_address(owner), to_address_str(native_sac), to_int128(1 * STROOP)],
            owner,
        )
        raise AssertionError("el deposito del owner deberia haber sido rechazado")
    except SimulationFailedError:
        print("rechazo auto-donacion OK")

    # 4. rechazo: pool completo (code_b nace completo).
    try:
        invoke_signed(
            "deposit",
            [to_string(code_b), to_address(donor), to_address_str(native_sac), to_int128(1 * STROOP)],
            donor,
        )
        raise AssertionError("el deposito al pool completo deberia haber sido rechazado")
    except SimulationFailedError:
        print("rechazo pool completo OK")

    # 5. withdraw del owner al momento: 1 XLM a dest.
    dest_before = xlm_balance(dest.public_key)
    invoke_signed(
        "withdraw",
        [to_string(code_a), to_address(owner), to_address_str(native_sac), to_address(dest), to_int128(1 * STROOP)],
        owner,
    )
    time.sleep(2)
    dest_after = xlm_balance(dest.public_key)
    assert dest_after - dest_before >= 1.0, (dest_before, dest_after)
    print(f"withdraw 1 XLM OK -> dest {dest_before:.2f} => {dest_after:.2f}")

    # 6. estado final: lo donado no baja al retirar.
    info = read("pool_info", [to_string(code_a)])
    native = scval_native(info)
    assert native["equivalent_total"] == 3 * STROOP, native
    assert native["assets"][0]["donated"] == 3 * STROOP, native
    assert native["assets"][0]["available"] == 2 * STROOP, native
    print("estado final OK ->", summarize(native))

    print("\nE2E COMPLETO: todas las reglas del vault funcionan on-chain.")
    return 0


def summarize(native: dict) -> str:
    return (
        f"equivalente={native['equivalent_total'] / STROOP} XLM, "
        f"completo={native['complete']}, assets={native['assets']}"
    )


def scval_native(result):
    from stellar_sdk import scval

    return scval.to_native(result)


def to_string(value: str):
    from stellar_sdk import scval

    return scval.to_string(value)


def to_address(keypair_or_str):
    from stellar_sdk import scval

    target = keypair_or_str.public_key if isinstance(keypair_or_str, Keypair) else keypair_or_str
    return scval.to_address(target)


def to_address_str(address: str):
    from stellar_sdk import scval

    return scval.to_address(address)


def to_int128(value: int):
    from stellar_sdk import scval

    return scval.to_int128(value)


if __name__ == "__main__":
    sys.exit(main())

