"""Tests unitarios de la logica de validacion del Modulo 3: topes de
retiro por asset y validacion estructural de las txs firmadas. Sin red ni
DB - lo unico que toca Horizon va mockeado.
"""

import secrets
from unittest import mock

from django.conf import settings
from django.test import SimpleTestCase
from django.urls import reverse
from rest_framework.test import APIClient, APITestCase
from stellar_sdk import Account, Asset, Keypair, Signer, TransactionBuilder
from stellar_sdk.signer_key import SignerKeyType

from stellar_common.assets import CIRCLE_TESTNET_ASSET_ISSUERS

from . import stellar_client
from . import views as family_views
from .models import FamilyPool
from .stellar_client import (
    WithdrawalLimitExceededError,
    WithdrawalValidationError,
    _effective_withdrawal_limit,
    _validate_signed_withdrawal,
    resolve_circle_or_native_asset,
    submit_add_signer,
)

USDC = Asset("USDC", CIRCLE_TESTNET_ASSET_ISSUERS["USDC"])


def _payment_xdr(source: Keypair, asset: Asset, amount: str, destination: str) -> str:
    builder = TransactionBuilder(
        Account(source.public_key, 1),
        network_passphrase=settings.STELLAR_NETWORK_PASSPHRASE,
        base_fee=100,
    ).append_payment_op(destination=destination, asset=asset, amount=amount)
    return builder.set_timeout(30).build().to_xdr()


class EffectiveWithdrawalLimitTests(SimpleTestCase):
    def test_xlm_usa_el_tope_general(self):
        asset = resolve_circle_or_native_asset("XLM")
        self.assertEqual(_effective_withdrawal_limit(asset, "50", {}), "50")

    def test_asset_configurado_usa_su_tope_propio(self):
        asset = resolve_circle_or_native_asset("USDC")
        self.assertEqual(
            _effective_withdrawal_limit(asset, "50", {"USDC": "100"}), "100"
        )

    def test_asset_sin_tope_se_rechaza(self):
        asset = resolve_circle_or_native_asset("USDC")
        with self.assertRaises(WithdrawalValidationError):
            _effective_withdrawal_limit(asset, "50", {})


class SignedWithdrawalValidationTests(SimpleTestCase):
    def setUp(self):
        self.pool = Keypair.random()
        self.destination = Keypair.random().public_key

    def test_retiro_xlm_dentro_del_tope_pasa(self):
        xdr = _payment_xdr(self.pool, Asset.native(), "40", self.destination)
        envelope = _validate_signed_withdrawal(
            self.pool.public_key, "50", xdr, {"USDC": "100"}
        )
        self.assertEqual(envelope.transaction.source.account_id, self.pool.public_key)

    def test_retiro_xlm_sobre_el_tope_se_rechaza(self):
        xdr = _payment_xdr(self.pool, Asset.native(), "60", self.destination)
        with self.assertRaises(WithdrawalLimitExceededError):
            _validate_signed_withdrawal(self.pool.public_key, "50", xdr, {"USDC": "100"})

    def test_retiro_usdc_usa_su_tope_propio_no_el_de_xlm(self):
        # 80 USDC pasaria contra un tope de 100 XLM, pero el tope de USDC
        # es mas chico: tiene que rechazarse con el tope del asset.
        xdr = _payment_xdr(self.pool, USDC, "80", self.destination)
        with self.assertRaises(WithdrawalLimitExceededError):
            _validate_signed_withdrawal(self.pool.public_key, "100", xdr, {"USDC": "50"})

    def test_retiro_usdc_sin_tope_configurado_se_rechaza(self):
        xdr = _payment_xdr(self.pool, USDC, "10", self.destination)
        with self.assertRaises(WithdrawalValidationError):
            _validate_signed_withdrawal(self.pool.public_key, "100", xdr, {})

    def test_asset_con_issuer_desconocido_se_rechaza(self):
        rogue = Asset("USDC", Keypair.random().public_key)
        xdr = _payment_xdr(self.pool, rogue, "10", self.destination)
        with self.assertRaises(WithdrawalValidationError):
            _validate_signed_withdrawal(self.pool.public_key, "100", xdr, {"USDC": "50"})

    def test_source_distinto_al_pool_se_rechaza(self):
        other = Keypair.random()
        xdr = _payment_xdr(other, Asset.native(), "10", self.destination)
        with self.assertRaises(WithdrawalValidationError):
            _validate_signed_withdrawal(self.pool.public_key, "50", xdr, {})


class AddSignerStructuralTests(SimpleTestCase):
    """La tx firmada de alta de firmante solo puede hacer lo que arma
    build_add_signer_tx: dar de alta un signer ed25519 nuevo (peso >= 1,
    sin tocar nada mas) + subir highThreshold (sin tocar nada mas).
    """

    def setUp(self):
        self.pool = Keypair.random()
        self.new_signer = Keypair.random()
        self.onchain = {
            "signers": [{"public_key": Keypair.random().public_key, "weight": 2}],
            "med_threshold": 2,
            "high_threshold": 2,
        }

    def _xdr(self, **overrides) -> str:
        builder = TransactionBuilder(
            Account(self.pool.public_key, 1),
            network_passphrase=settings.STELLAR_NETWORK_PASSPHRASE,
            base_fee=100,
        )
        builder = builder.append_ed25519_public_key_signer(
            overrides.get("signer", self.new_signer.public_key),
            overrides.get("weight", 1),
        )
        builder = builder.append_set_options_op(
            high_threshold=overrides.get("high_threshold", 3)
        )
        if overrides.get("extra_master_weight") is not None:
            builder = builder.append_set_options_op(
                master_weight=overrides.get("extra_master_weight")
            )
        return builder.set_timeout(30).build().to_xdr()

    def _submit(self, xdr: str):
        with (
            mock.patch.object(stellar_client, "confirm_pool_setup", return_value=self.onchain),
            mock.patch.object(
                stellar_client, "_submit_pool_envelope", return_value={"hash": "h", "ledger": 1}
            ) as submit,
        ):
            return submit_add_signer(self.pool.public_key, xdr), submit

    def _rejects(self, xdr: str):
        _, submit = self._submit(xdr)
        submit.assert_not_called()

    def test_alta_valida_pasa(self):
        result, submit = self._submit(self._xdr())
        self.assertEqual(result["hash"], "h")
        submit.assert_called_once()

    def test_baja_de_signer_se_rechaza(self):
        # weight 0 en Stellar borra el signer: no es un alta.
        with self.assertRaises(WithdrawalValidationError):
            self._rejects(self._xdr(weight=0))

    def test_recuperar_master_weight_se_rechaza(self):
        with self.assertRaises(WithdrawalValidationError):
            self._rejects(self._xdr(extra_master_weight=255))

    def test_bajar_high_threshold_se_rechaza(self):
        with self.assertRaises(WithdrawalValidationError):
            self._rejects(self._xdr(high_threshold=1))

    def test_signer_ya_existente_se_rechaza(self):
        existing = self.onchain["signers"][0]["public_key"]
        with self.assertRaises(WithdrawalValidationError):
            self._rejects(self._xdr(signer=existing))

    def test_master_key_como_signer_se_rechaza(self):
        with self.assertRaises(WithdrawalValidationError):
            self._rejects(self._xdr(signer=self.pool.public_key))

    def test_una_sola_operacion_se_rechaza(self):
        builder = TransactionBuilder(
            Account(self.pool.public_key, 1),
            network_passphrase=settings.STELLAR_NETWORK_PASSPHRASE,
            base_fee=100,
        ).append_ed25519_public_key_signer(self.new_signer.public_key, 1)
        xdr = builder.set_timeout(30).build().to_xdr()
        with self.assertRaises(WithdrawalValidationError):
            self._rejects(xdr)

    def test_signer_no_ed25519_se_rechaza(self):
        builder = TransactionBuilder(
            Account(self.pool.public_key, 1),
            network_passphrase=settings.STELLAR_NETWORK_PASSPHRASE,
            base_fee=100,
        )
        builder = builder.append_set_options_op(
            signer=Signer.sha256_hash(secrets.token_bytes(32), 1)
        )
        builder = builder.append_set_options_op(high_threshold=3)
        self.assertEqual(
            builder.operations[0].signer.signer_key.signer_key_type,
            SignerKeyType.SIGNER_KEY_TYPE_HASH_X,
        )
        xdr = builder.set_timeout(30).build().to_xdr()
        with self.assertRaises(WithdrawalValidationError):
            self._rejects(xdr)

WALLET = "GA7YOVSW63BEGKYD7SIPDIX5N5HPCESSAHEU2ZKZD6X6KCMD6HHMEWVU"
CREATOR = "GATBY4ZPTJDMHHKO4RGZKLABG2FWATOYN72FN5A2ERSCFQ3OBZD7IJFB"
INVITED = "GCHQ5FJUSFTEYNSDO25VFYSQQKZ2TDH2JO2XSGKKLLFGNQ3HL4ZODJOS"


class FamilyVaultGuardTests(APITestCase):
    """Solo el creador de una caja puede agregar wallets (firmantes o
    depositantes), tanto en el build del alta como en su submit."""

    def setUp(self):
        self.client = APIClient()
        self.pool = FamilyPool.objects.create(
            pool_account=CREATOR,
            title="Caja de prueba",
            creator=CREATOR,
            withdrawal_limit="50",
            signers=[
                {"public_key": CREATOR, "weight": 1},
                {"public_key": INVITED, "weight": 1},
            ],
            med_threshold=2,
            high_threshold=2,
        )

    def test_add_signer_build_solo_creador(self):
        url = reverse("family-pool-add-signer-build", args=[self.pool.pool_account])
        response = self.client.post(
            url,
            {
                "signer_public_key": WALLET,
                "weight": 1,
                "requester_public_key": INVITED,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 403)

        with mock.patch.object(
            family_views, "build_add_signer_tx", return_value="xdr-ok"
        ):
            response = self.client.post(
                url,
                {
                    "signer_public_key": WALLET,
                    "weight": 1,
                    "requester_public_key": CREATOR,
                },
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["xdr"], "xdr-ok")

    def test_add_signer_submit_solo_creador(self):
        url = reverse("family-pool-add-signer-submit", args=[self.pool.pool_account])
        response = self.client.post(
            url,
            {"signed_xdr": "xdr", "requester_public_key": INVITED},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

        with mock.patch.object(
            family_views, "submit_add_signer", return_value={"hash": "h", "ledger": 1}
        ), mock.patch.object(
            family_views, "confirm_pool_setup", return_value={
                "signers": [{"public_key": CREATOR, "weight": 1}],
                "med_threshold": 1,
                "high_threshold": 1,
            }
        ):
            response = self.client.post(
                url,
                {"signed_xdr": "xdr", "requester_public_key": CREATOR},
                format="json",
            )
        self.assertEqual(response.status_code, 200)

    def test_add_depositor_solo_creador(self):
        url = reverse("family-pool-add-depositor", args=[self.pool.pool_account])
        response = self.client.post(
            url,
            {"public_key": WALLET, "requester_public_key": INVITED},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

        response = self.client.post(
            url,
            {"public_key": WALLET, "requester_public_key": CREATOR},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.pool.refresh_from_db()
        self.assertIn(WALLET, self.pool.depositors)
        self.assertEqual(self.pool.wallet_roles.get(WALLET), "deposit")
