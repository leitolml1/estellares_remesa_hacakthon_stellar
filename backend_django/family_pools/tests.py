"""Tests unitarios de la logica de validacion del Modulo 3: topes de
retiro por asset y validacion estructural de las txs firmadas. Sin red ni
DB - lo unico que toca Horizon va mockeado.
"""

import json
import secrets
from unittest import mock

import requests
from django.conf import settings
from django.test import SimpleTestCase
from django.urls import reverse
from rest_framework.test import APIClient, APITestCase
from stellar_sdk import Account, Asset, Keypair, Signer, TransactionBuilder
from stellar_sdk.exceptions import BadRequestError
from stellar_sdk.signer_key import SignerKeyType

from stellar_common.assets import CIRCLE_TESTNET_ASSET_ISSUERS

from . import stellar_client
from . import views as family_views
from .models import FamilyPool
from .stellar_client import (
    StellarSubmissionError,
    WithdrawalLimitExceededError,
    WithdrawalValidationError,
    _effective_withdrawal_limit,
    _validate_signed_withdrawal,
    resolve_circle_or_native_asset,
    submit_set_signer,
)

USDC = Asset("USDC", CIRCLE_TESTNET_ASSET_ISSUERS["USDC"])


def _bad_request_with_codes(result_codes: dict) -> BadRequestError:
    """BadRequestError como la armaria Horizon para un POST rechazado:
    response 400 con extras.result_codes."""
    response = requests.Response()
    response.status_code = 400
    response._content = json.dumps({"extras": {"result_codes": result_codes}}).encode()
    return BadRequestError(response)


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


class SubmissionErrorMappingTests(SimpleTestCase):
    """Horizon rechaza txs con result codes que antes se tragaban en un
    mensaje generico: cada codigo tiene que mapear a un mensaje claro y el
    fallback tiene que incluir los codes crudos."""

    def _mapped(self, result_codes: dict) -> StellarSubmissionError:
        return StellarSubmissionError.from_bad_request(
            _bad_request_with_codes(result_codes)
        )

    def test_tx_bad_auth_extra_nombra_la_cuenta_de_freighter(self):
        error = self._mapped({"transaction": "tx_bad_auth_extra"})
        self.assertEqual(error.category, "insufficient_signatures")
        self.assertIn("Freighter", error.message)

    def test_tx_too_late_explica_el_vencimiento(self):
        error = self._mapped({"transaction": "tx_too_late"})
        self.assertIn("vencio", error.message)

    def test_tx_insufficient_fee_explica_la_comision(self):
        error = self._mapped({"transaction": "tx_insufficient_fee"})
        self.assertIn("comision", error.message)

    def test_op_invalid_set_options_explica_el_rango(self):
        error = self._mapped({"transaction": "tx_failed", "operations": ["op_invalid_set_options"]})
        self.assertIn("op_invalid_set_options", error.message)

    def test_op_low_reserve_explica_la_reserva(self):
        error = self._mapped({"transaction": "tx_failed", "operations": ["op_low_reserve"]})
        self.assertIn("reserva", error.message)

    def test_tx_bad_seq_sigue_mapeado(self):
        error = self._mapped({"transaction": "tx_bad_seq"})
        self.assertEqual(error.category, "bad_seq")

    def test_falta_de_firmas_sigue_mapeada(self):
        error = self._mapped({"transaction": "tx_bad_auth"})
        self.assertEqual(error.category, "insufficient_signatures")

    def test_codigo_desconocido_incluye_los_codes_crudos(self):
        error = self._mapped({"transaction": "tx_futuro_desconocido"})
        self.assertIn("tx_futuro_desconocido", error.message)
        self.assertIn("result codes", error.message)


class SetSignerStructuralTests(SimpleTestCase):
    """La tx firmada de operacion de firmante solo puede hacer lo que arma
    build_set_signer_tx: UNA operacion SetOptions que toca solo el campo
    `signer` (alta weight >= 1, cambio de peso, o baja con weight 0), sin
    tocar master_weight ni thresholds.
    """

    def setUp(self):
        self.pool = Keypair.random()
        self.creator = Keypair.random()
        self.existing = Keypair.random()
        self.new_signer = Keypair.random()
        self.onchain = {
            "signers": [
                {"public_key": self.creator.public_key, "weight": 2},
                {"public_key": self.existing.public_key, "weight": 1},
            ],
            "med_threshold": 1,
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
        if overrides.get("extra_high_threshold") is not None:
            builder = builder.append_set_options_op(
                high_threshold=overrides.get("extra_high_threshold")
            )
        if overrides.get("extra_master_weight") is not None:
            builder = builder.append_set_options_op(
                master_weight=overrides.get("extra_master_weight")
            )
        return builder.set_timeout(30).build().to_xdr()

    def _submit(self, xdr: str, **overrides):
        with (
            mock.patch.object(stellar_client, "confirm_pool_setup", return_value=overrides.get("onchain", self.onchain)),
            mock.patch.object(
                stellar_client, "_submit_pool_envelope", return_value={"hash": "h", "ledger": 1}
            ) as submit,
        ):
            return (
                submit_set_signer(
                    self.pool.public_key,
                    overrides.get("creator", self.creator.public_key),
                    xdr,
                ),
                submit,
            )

    def _rejects(self, xdr: str, **overrides):
        _, submit = self._submit(xdr, **overrides)
        submit.assert_not_called()

    def test_alta_valida_pasa(self):
        result, submit = self._submit(self._xdr())
        self.assertEqual(result["hash"], "h")
        self.assertEqual(result["signer"], self.new_signer.public_key)
        self.assertEqual(result["weight"], 1)
        submit.assert_called_once()

    def test_baja_de_signer_pasa(self):
        # weight 0 en Stellar borra el signer: la baja es una operacion
        # admitida del nuevo modelo (el creator tiene poder unilateral).
        result, submit = self._submit(
            self._xdr(signer=self.existing.public_key, weight=0)
        )
        self.assertEqual(result["signer"], self.existing.public_key)
        self.assertEqual(result["weight"], 0)
        submit.assert_called_once()

    def test_cambio_de_peso_pasa(self):
        result, submit = self._submit(self._xdr(signer=self.existing.public_key, weight=1))
        self.assertEqual(result["weight"], 1)
        submit.assert_called_once()

    def test_bajar_high_threshold_se_rechaza(self):
        with self.assertRaises(WithdrawalValidationError):
            self._rejects(self._xdr(extra_high_threshold=1))

    def test_recuperar_master_weight_se_rechaza(self):
        with self.assertRaises(WithdrawalValidationError):
            self._rejects(self._xdr(extra_master_weight=255))

    def test_baja_de_wallet_inexistente_se_rechaza(self):
        with self.assertRaises(WithdrawalValidationError):
            self._rejects(self._xdr(weight=0))

    def test_baja_del_creator_se_rechaza(self):
        with self.assertRaises(WithdrawalValidationError):
            self._rejects(self._xdr(signer=self.creator.public_key, weight=0))

    def test_bajar_peso_del_creator_debajo_del_high_se_rechaza(self):
        onchain = {
            "signers": [
                {"public_key": self.creator.public_key, "weight": 2},
                {"public_key": self.existing.public_key, "weight": 1},
            ],
            "med_threshold": 1,
            "high_threshold": 2,
        }
        with self.assertRaises(WithdrawalValidationError):
            self._rejects(
                self._xdr(signer=self.creator.public_key, weight=1), onchain=onchain
            )

    def test_baja_que_deja_nadie_al_umbral_se_rechaza(self):
        # Caja "vieja" (todos weight 1, high 2): si se da de baja a uno,
        # nadie vuelve a alcanzar el highThreshold.
        onchain = {
            "signers": [
                {"public_key": self.creator.public_key, "weight": 1},
                {"public_key": self.existing.public_key, "weight": 1},
            ],
            "med_threshold": 1,
            "high_threshold": 2,
        }
        with self.assertRaises(WithdrawalValidationError):
            self._rejects(
                self._xdr(signer=self.existing.public_key, weight=0), onchain=onchain
            )

    def test_master_key_como_signer_se_rechaza(self):
        with self.assertRaises(WithdrawalValidationError):
            self._rejects(self._xdr(signer=self.pool.public_key))

    def test_dos_operaciones_se_rechazan(self):
        builder = TransactionBuilder(
            Account(self.pool.public_key, 1),
            network_passphrase=settings.STELLAR_NETWORK_PASSPHRASE,
            base_fee=100,
        )
        builder = builder.append_ed25519_public_key_signer(self.new_signer.public_key, 1)
        builder = builder.append_set_options_op(high_threshold=3)
        xdr = builder.set_timeout(30).build().to_xdr()
        with self.assertRaises(WithdrawalValidationError):
            self._rejects(xdr)

    def test_signer_no_ed25519_se_rechaza(self):
        builder = TransactionBuilder(
            Account(self.pool.public_key, 1),
            network_passphrase=settings.STELLAR_NETWORK_PASSPHRASE,
            base_fee=100,
        ).append_set_options_op(
            signer=Signer.sha256_hash(secrets.token_bytes(32), 1)
        )
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
                {"public_key": CREATOR, "weight": 2},
                {"public_key": INVITED, "weight": 1},
            ],
            med_threshold=1,
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
            family_views, "build_set_signer_tx", return_value="xdr-ok"
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
            family_views,
            "submit_set_signer",
            return_value={"hash": "h", "ledger": 1, "signer": WALLET, "weight": 1},
        ), mock.patch.object(
            family_views, "confirm_pool_setup", return_value={
                "signers": [
                    {"public_key": CREATOR, "weight": 2},
                    {"public_key": WALLET, "weight": 1},
                ],
                "med_threshold": 1,
                "high_threshold": 2,
            }
        ):
            response = self.client.post(
                url,
                {"signed_xdr": "xdr", "requester_public_key": CREATOR},
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        self.pool.refresh_from_db()
        self.assertEqual(self.pool.wallet_roles.get(WALLET), "deposit_withdraw")

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


class FamilyPoolLimitsUpdateTests(APITestCase):
    """El cambio de topes de retiro queda reservado al creator: ni los
    firmantes de la familia ni un extraño pueden subir el tope."""

    def setUp(self):
        self.client = APIClient()
        self.pool = FamilyPool.objects.create(
            pool_account=CREATOR,
            title="Caja de prueba",
            creator=CREATOR,
            withdrawal_limit="50",
            asset_withdrawal_limits={},
            signers=[
                {"public_key": CREATOR, "weight": 1},
                {"public_key": INVITED, "weight": 1},
            ],
            med_threshold=2,
            high_threshold=2,
        )

    def _url(self):
        return reverse("family-pool-limits-update", args=[self.pool.pool_account])

    def _payload(self, requester=CREATOR, **overrides):
        body = {
            "requester_public_key": requester,
            "withdrawal_limit": "1000",
            "asset_withdrawal_limits": {"USDC": "100", "EURC": "100"},
        }
        body.update(overrides)
        return body

    def test_creator_actualiza_topes(self):
        response = self.client.post(self._url(), self._payload(), format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["withdrawal_limit"], "1000")
        self.assertEqual(response.json()["asset_withdrawal_limits"], {"USDC": "100", "EURC": "100"})
        self.pool.refresh_from_db()
        self.assertEqual(self.pool.withdrawal_limit, "1000")
        self.assertEqual(self.pool.asset_withdrawal_limits, {"USDC": "100", "EURC": "100"})

    def test_depositor_no_actualiza_topes(self):
        response = self.client.post(
            self._url(), self._payload(requester=INVITED), format="json"
        )
        self.assertEqual(response.status_code, 403)

    def test_extraño_no_actualiza_topes(self):
        response = self.client.post(
            self._url(), self._payload(requester=WALLET), format="json"
        )
        self.assertEqual(response.status_code, 403)

    def test_tope_xlm_invalido_se_rechaza(self):
        response = self.client.post(
            self._url(), self._payload(withdrawal_limit="-5"), format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.pool.refresh_from_db()
        self.assertEqual(self.pool.withdrawal_limit, "50")

    def test_asset_no_admitido_se_rechaza(self):
        response = self.client.post(
            self._url(),
            self._payload(asset_withdrawal_limits={"BTC": "100"}),
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.pool.refresh_from_db()
        self.assertEqual(self.pool.asset_withdrawal_limits, {})

    def test_topes_nuevos_aplican_al_retiro(self):
        # El tope guardado es lo que leen build/submit de retiro: con el
        # tope de USDC en 100, un retiro firmado de 150 se rechaza pero
        # 100 pasa (validacion del submit, sin red).
        response = self.client.post(self._url(), self._payload(), format="json")
        self.assertEqual(response.status_code, 200)

        self.pool.refresh_from_db()
        pool = Keypair.from_public_key(CREATOR)
        destination = Keypair.random().public_key
        over = _payment_xdr(pool, USDC, "150", destination)
        with self.assertRaises(WithdrawalLimitExceededError):
            _validate_signed_withdrawal(
                CREATOR, self.pool.withdrawal_limit, over, self.pool.asset_withdrawal_limits
            )

        within = _payment_xdr(pool, USDC, "100", destination)
        _validate_signed_withdrawal(
            CREATOR, self.pool.withdrawal_limit, within, self.pool.asset_withdrawal_limits
        )


class MemberRoleTests(APITestCase):
    """El cambio de permisos de una wallet lo pide el creator y es solo de
    la DB (sin firmas de la familia). Promover a retiro exige que la
    wallet ya sea firmante on-chain."""

    def setUp(self):
        self.client = APIClient()
        self.pool = FamilyPool.objects.create(
            pool_account=CREATOR,
            title="Caja de prueba",
            creator=CREATOR,
            withdrawal_limit="50",
            signers=[
                {"public_key": CREATOR, "weight": 2},
                {"public_key": INVITED, "weight": 1},
            ],
            depositors=[WALLET],
            wallet_roles={CREATOR: "deposit_withdraw", INVITED: "withdraw", WALLET: "deposit"},
            med_threshold=1,
            high_threshold=2,
        )

    def _url(self):
        return reverse("family-pool-member-role", args=[self.pool.pool_account])

    def test_creator_cambia_rol_de_firmante(self):
        response = self.client.post(
            self._url(),
            {"public_key": INVITED, "role": "deposit", "requester_public_key": CREATOR},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.pool.refresh_from_db()
        self.assertEqual(self.pool.wallet_roles.get(INVITED), "deposit")

    def test_promover_a_retiro_sin_ser_firmante_se_rechaza(self):
        response = self.client.post(
            self._url(),
            {"public_key": WALLET, "role": "withdraw", "requester_public_key": CREATOR},
            format="json",
        )
        self.assertEqual(response.status_code, 422)
        self.pool.refresh_from_db()
        self.assertEqual(self.pool.wallet_roles.get(WALLET), "deposit")

    def test_promover_a_retiro_siendo_firmante_pasa(self):
        response = self.client.post(
            self._url(),
            {"public_key": INVITED, "role": "deposit_withdraw", "requester_public_key": CREATOR},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.pool.refresh_from_db()
        self.assertEqual(self.pool.wallet_roles.get(INVITED), "deposit_withdraw")

    def test_no_creador_no_cambia_roles(self):
        for requester in (INVITED, WALLET):
            response = self.client.post(
                self._url(),
                {"public_key": INVITED, "role": "deposit", "requester_public_key": requester},
                format="json",
            )
            self.assertEqual(response.status_code, 403)

    def test_creator_no_puede_cambiarse_rol(self):
        response = self.client.post(
            self._url(),
            {"public_key": CREATOR, "role": "deposit", "requester_public_key": CREATOR},
            format="json",
        )
        self.assertEqual(response.status_code, 409)

    def test_rol_invalido_se_rechaza(self):
        response = self.client.post(
            self._url(),
            {"public_key": INVITED, "role": "admin", "requester_public_key": CREATOR},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_retiro_con_rol_solo_deposito_se_rechaza(self):
        # INVITED pasa a solo-deposito: aunque siga siendo firmante
        # on-chain, el build de retiro le queda bloqueado en la API.
        response = self.client.post(
            self._url(),
            {"public_key": INVITED, "role": "deposit", "requester_public_key": CREATOR},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        url = reverse("family-pool-withdrawal-build", args=[self.pool.pool_account])
        response = self.client.post(
            url,
            {
                "destination_public_key": WALLET,
                "amount": "10",
                "requester_public_key": INVITED,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 403)


class MemberRemoveTests(APITestCase):
    """La baja de una wallet a nivel app la pide el creator: saca la
    wallet de depositors y wallet_roles sin tocar on-chain."""

    def setUp(self):
        self.client = APIClient()
        self.pool = FamilyPool.objects.create(
            pool_account=CREATOR,
            title="Caja de prueba",
            creator=CREATOR,
            withdrawal_limit="50",
            signers=[
                {"public_key": CREATOR, "weight": 2},
                {"public_key": INVITED, "weight": 1},
            ],
            depositors=[WALLET],
            wallet_roles={CREATOR: "deposit_withdraw", INVITED: "withdraw", WALLET: "deposit"},
            med_threshold=1,
            high_threshold=2,
        )

    def _url(self):
        return reverse("family-pool-member-remove", args=[self.pool.pool_account])

    def test_creator_da_de_baja_depositor(self):
        response = self.client.post(
            self._url(),
            {"public_key": WALLET, "requester_public_key": CREATOR},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.pool.refresh_from_db()
        self.assertNotIn(WALLET, self.pool.depositors)
        self.assertNotIn(WALLET, self.pool.wallet_roles)

    def test_extraño_no_da_de_baja(self):
        response = self.client.post(
            self._url(),
            {"public_key": WALLET, "requester_public_key": INVITED},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.pool.refresh_from_db()
        self.assertIn(WALLET, self.pool.depositors)

    def test_creator_no_puede_darse_de_baja(self):
        response = self.client.post(
            self._url(),
            {"public_key": CREATOR, "requester_public_key": CREATOR},
            format="json",
        )
        self.assertEqual(response.status_code, 409)

    def test_wallet_desconocida_da_404(self):
        response = self.client.post(
            self._url(),
            {"public_key": Keypair.random().public_key, "requester_public_key": CREATOR},
            format="json",
        )
        self.assertEqual(response.status_code, 404)
