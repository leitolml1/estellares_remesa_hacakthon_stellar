"""Tests unitarios de las reglas de donacion del Modulo 2: las
auto-donaciones (creador / wallet receptora) no cuentan en el progreso, y
la meta se marca como cumplida recien cuando el total en XLM equivalentes
la alcanza. Mas los guards de las vistas del vault (contrato Soroban).
Horizon y Soroban RPC van mockeados en todos lados.
"""

from unittest import mock

from django.test import SimpleTestCase
from django.urls import reverse
from rest_framework.test import APIClient, APITestCase

from stellar_common.assets import CIRCLE_TESTNET_ASSET_ISSUERS

from . import stellar_client
from . import views as pool_views
from .models import Pool
from .stellar_client import _fetch_memos_in_batches, _sync_pool_donations, fetch_pool_donations, progress_summary

USDC_ISSUER = CIRCLE_TESTNET_ASSET_ISSUERS["USDC"]
USDC_KEY = f"USDC:{USDC_ISSUER}"


class _FakePaymentsEndpoint:
    def __init__(self, records):
        self._records = records

    def for_account(self, account):
        return self

    def order(self, desc):
        return self

    def limit(self, n):
        return self

    def cursor(self, c):
        return self

    def call(self):
        return {"_embedded": {"records": self._records}}


class _FakeServer:
    def __init__(self, records):
        self._records = records

    def payments(self):
        return _FakePaymentsEndpoint(self._records)


def _payment_op(from_key: str, to_key: str, amount: str, asset_type="native", **kwargs):
    transaction_hash = kwargs.pop("transaction_hash", "txhash")
    op = {
        "type": "payment",
        "from": from_key,
        "to": to_key,
        "amount": amount,
        "asset_type": asset_type,
        "id": kwargs.pop("operation_id", f"op-{transaction_hash}"),
        "transaction_hash": transaction_hash,
        "paging_token": kwargs.pop("paging_token", "pt"),
        "created_at": kwargs.pop("created_at", "2026-01-01T00:00:00Z"),
    }
    op.update(kwargs)
    if asset_type != "native":
        op["asset_code"] = kwargs.pop("asset_code", "USDC")
        op["asset_issuer"] = kwargs.pop("asset_issuer", USDC_ISSUER)
    return op


def _pool(**overrides) -> Pool:
    defaults = dict(
        short_code="abc1234567",
        wallet_address="WALLET",
        creator="CREATOR",
        title="Pool de prueba",
        goal_amount=None,
        donation_count=0,
        total_donated_by_asset={},
        donations_synced_cursor=None,
    )
    defaults.update(overrides)
    return Pool(**defaults)


class SyncSkipsSelfDonationsTests(SimpleTestCase):
    def _run_sync(self, pool, records, memos):
        server = _FakeServer(records)
        with (
            mock.patch.object(stellar_client, "get_server", return_value=server),
            mock.patch.object(stellar_client, "_fetch_memos_in_batches", return_value=memos),
        ):
            _sync_pool_donations(pool)
        return pool

    def test_auto_donaciones_no_cuentan(self):
        pool = _pool()
        records = [
            _payment_op("CREATOR", "WALLET", "100", transaction_hash="h1", paging_token="t1"),
            _payment_op("WALLET", "WALLET", "50", transaction_hash="h2", paging_token="t2"),
            _payment_op("DONANTE", "WALLET", "5", transaction_hash="h3", paging_token="t3"),
        ]
        memos = {"h1": "abc1234567", "h2": "abc1234567", "h3": "abc1234567"}
        self._run_sync(pool, records, memos)
        self.assertEqual(pool.donation_count, 1)
        self.assertEqual(pool.total_donated_by_asset, {"XLM": "5"})

    def test_donacion_con_memo_de_otro_pool_no_cuenta(self):
        pool = _pool()
        records = [
            _payment_op("DONANTE", "WALLET", "7", transaction_hash="h1", paging_token="t1"),
        ]
        memos = {"h1": "otromemo99"}
        self._run_sync(pool, records, memos)
        self.assertEqual(pool.donation_count, 0)
        self.assertEqual(pool.total_donated_by_asset, {})

    def test_donaciones_multi_asset_se_acumulan_por_asset(self):
        pool = _pool()
        records = [
            _payment_op("DONANTE", "WALLET", "3", transaction_hash="h1", paging_token="t1"),
            _payment_op(
                "DONANTE",
                "WALLET",
                "6",
                asset_type="credit_alphanum4",
                transaction_hash="h2",
                paging_token="t2",
            ),
        ]
        memos = {"h1": "abc1234567", "h2": "abc1234567"}
        self._run_sync(pool, records, memos)
        self.assertEqual(pool.donation_count, 2)
        self.assertEqual(pool.total_donated_by_asset, {"XLM": "3", USDC_KEY: "6"})


class ProgressSummaryTests(SimpleTestCase):
    def test_sin_meta_nunca_esta_completo(self):
        pool = _pool(goal_amount=None, donation_count=5, total_donated_by_asset={"XLM": "999"})
        summary = progress_summary(pool)
        self.assertFalse(summary["completed"])
        self.assertEqual(summary["xlm_equivalent_total"], "999")

    def test_xlm_alcanza_la_meta(self):
        pool = _pool(goal_amount="100", total_donated_by_asset={"XLM": "100"})
        self.assertTrue(progress_summary(pool)["completed"])

    def test_xlm_solo_no_alcanza(self):
        pool = _pool(goal_amount="100", total_donated_by_asset={"XLM": "99.9"})
        self.assertFalse(progress_summary(pool)["completed"])

    def test_usdc_cuenta_con_tasa_referencial(self):
        # 50 XLM + 6 USDC * 10 = 110 XLM equivalentes >= meta 100.
        pool = _pool(goal_amount="100", total_donated_by_asset={"XLM": "50", USDC_KEY: "6"})
        summary = progress_summary(pool)
        self.assertTrue(summary["completed"])
        self.assertEqual(summary["xlm_equivalent_total"], "110")

    def test_asset_sin_tasa_es_fail_closed(self):
        # Un asset desconocido sin tasa referencial: no se marca completo y
        # el equivalente llega en None (conteo incompleto, no confiable).
        pool = _pool(
            goal_amount="100",
            total_donated_by_asset={"XLM": "200", "MOON:GOTRO": "1"},
        )
        summary = progress_summary(pool)
        self.assertFalse(summary["completed"])
        self.assertIsNone(summary["xlm_equivalent_total"])


class PoolDonationsFeedTests(SimpleTestCase):
    """El feed de donaciones del pool solo incluye pagos ENTRANTES con el
    memo del pool: ni los gastos salientes de la wallet ni los pagos
    entrantes de otros contextos (sin memo / otro memo) son donaciones."""

    def test_solo_entrantes_con_memo_del_pool(self):
        pool = _pool()
        raw = [
            _payment_op("CREATOR", "WALLET", "100", transaction_hash="h1", paging_token="t1"),
            _payment_op("DONANTE", "WALLET", "5", transaction_hash="h2", paging_token="t2"),
            _payment_op("DONANTE", "OTRO", "7", transaction_hash="h3", paging_token="t3"),
        ]
        memos = {
            "h1": "abc1234567",
            "h2": "abc1234567",
            "h3": "abc1234567",
        }
        server = _FakeServer(raw)
        with (
            mock.patch.object(stellar_client, "get_server", return_value=server),
            mock.patch.object(stellar_client, "_fetch_memos_in_batches", return_value=memos),
        ):
            records = fetch_pool_donations(pool, 20)

        # Solo el pago del DONANTE con memo del pool: el auto (h1) y el
        # saliente (h3) no corresponden al pool.
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["sender"], "DONANTE")
        self.assertEqual(records[0]["amount"], "5")

    def test_entrantes_sin_memo_del_pool_no_aparecen(self):
        pool = _pool()
        raw = [
            _payment_op("DONANTE", "WALLET", "5", transaction_hash="h1", paging_token="t1"),
        ]
        with (
            mock.patch.object(stellar_client, "get_server", return_value=_FakeServer(raw)),
            mock.patch.object(stellar_client, "_fetch_memos_in_batches", return_value={"h1": "otromemo9"}),
        ):
            records = fetch_pool_donations(pool, 20)
        self.assertEqual(records, [])

    def test_sin_entrantes_devuelve_lista_vacia(self):
        pool = _pool()
        raw = [
            _payment_op("DONANTE", "OTRO", "7", transaction_hash="h1", paging_token="t1"),
        ]
        with mock.patch.object(stellar_client, "get_server", return_value=_FakeServer(raw)):
            records = fetch_pool_donations(pool, 20)
        self.assertEqual(records, [])


WALLET = "GA7YOVSW63BEGKYD7SIPDIX5N5HPCESSAHEU2ZKZD6X6KCMD6HHMEWVU"
CREATOR = "GATBY4ZPTJDMHHKO4RGZKLABG2FWATOYN72FN5A2ERSCFQ3OBZD7IJFB"
DONOR = "GCHQ5FJUSFTEYNSDO25VFYSQQKZ2TDH2JO2XSGKKLLFGNQ3HL4ZODJOS"


class VaultViewTests(APITestCase):
    """Guards de las vistas del vault: quien puede registrar/depositar/
    retirar, y que el submit revalida la tx firmada contra este pool."""

    def setUp(self):
        self.client = APIClient()
        self.pool = Pool.objects.create(
            short_code="testpool01",
            wallet_address=WALLET,
            title="Pool de prueba vault",
            goal_amount="100",
            creator=CREATOR,
        )

    def _register(self, owner, registered=False):
        if registered:
            self.pool.vault_registered = True
            self.pool.save(update_fields=["vault_registered"])
        with mock.patch.object(pool_views, "build_create_pool_tx", return_value="xdr-reg") as build, \
                mock.patch.object(pool_views, "_current_vault_equivalent", return_value=0):
            response = self.client.post(
                reverse("pool-vault-register-build", args=[self.pool.short_code]),
                {"owner_public_key": owner},
                format="json",
            )
        return response, build

    def test_register_lo_firma_solo_la_wallet_del_pool(self):
        response, build = self._register(CREATOR)
        self.assertEqual(response.status_code, 403)
        build.assert_not_called()

        response, build = self._register(WALLET)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["xdr"], "xdr-reg")
        build.assert_called_once_with("testpool01", WALLET, 100 * 10_000_000, 0)

    def test_register_de_un_pool_ya_registrado_da_409(self):
        response, _ = self._register(WALLET, registered=True)
        self.assertEqual(response.status_code, 409)

    def _deposit(self, donor, registered=True, amount="5", asset_code="XLM"):
        if registered and not self.pool.vault_registered:
            self.pool.vault_registered = True
            self.pool.save(update_fields=["vault_registered"])
        with mock.patch.object(pool_views, "build_deposit_tx", return_value="xdr-dep") as build, \
                mock.patch.object(
                    pool_views,
                    "get_vault_state",
                    return_value={"registered": True, "complete": False},
                ):
            response = self.client.post(
                reverse("pool-vault-deposit-build", args=[self.pool.short_code]),
                {"donor_public_key": donor, "asset_code": asset_code, "amount": amount},
                format="json",
            )
        return response, build

    def test_deposit_solo_si_el_pool_esta_registrado(self):
        response, build = self._deposit(DONOR, registered=False)
        self.assertEqual(response.status_code, 409)
        build.assert_not_called()

    def test_deposit_rechaza_auto_donacion_de_wallet_y_creador(self):
        response, build = self._deposit(WALLET)
        self.assertEqual(response.status_code, 422)
        build.assert_not_called()

        response, build = self._deposit(CREATOR)
        self.assertEqual(response.status_code, 422)
        build.assert_not_called()

        response, build = self._deposit(DONOR)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["xdr"], "xdr-dep")

    def test_deposit_rechaza_si_la_meta_esta_completa(self):
        self.pool.vault_registered = True
        self.pool.save(update_fields=["vault_registered"])
        with mock.patch.object(pool_views, "build_deposit_tx", return_value="xdr-dep") as build, \
                mock.patch.object(
                    pool_views,
                    "get_vault_state",
                    return_value={"registered": True, "complete": True},
                ):
            response = self.client.post(
                reverse("pool-vault-deposit-build", args=[self.pool.short_code]),
                {"donor_public_key": DONOR, "asset_code": "XLM", "amount": "5"},
                format="json",
            )
        self.assertEqual(response.status_code, 422)
        self.assertIn("Meta alcanzada", response.json()["detail"])
        build.assert_not_called()

    def _withdraw(self, owner, registered=True, amount="5", state_assets=None):
        if registered and not self.pool.vault_registered:
            self.pool.vault_registered = True
            self.pool.save(update_fields=["vault_registered"])
        state = {
            "registered": True,
            "owner": WALLET,
            "assets": state_assets
            if state_assets is not None
            else [{"asset_code": "XLM", "available": "10", "donated": "10", "withdrawn": "0"}],
        }
        with mock.patch.object(pool_views, "get_vault_state", return_value=state), \
                mock.patch.object(pool_views, "build_withdraw_tx", return_value="xdr-wit") as build:
            response = self.client.post(
                reverse("pool-vault-withdraw-build", args=[self.pool.short_code]),
                {
                    "owner_public_key": owner,
                    "asset_code": "XLM",
                    "destination_public_key": DONOR,
                    "amount": amount,
                },
                format="json",
            )
        return response, build

    def test_withdraw_lo_firma_solo_la_wallet_del_pool(self):
        response, build = self._withdraw(CREATOR)
        self.assertEqual(response.status_code, 403)
        build.assert_not_called()

        response, build = self._withdraw(WALLET)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["xdr"], "xdr-wit")

    def test_withdraw_prechequea_lo_disponible_en_el_vault(self):
        response, build = self._withdraw(WALLET, amount="11")
        self.assertEqual(response.status_code, 422)
        build.assert_not_called()

    def _submit(self, fn_name, args, registered=False):
        if registered and not self.pool.vault_registered:
            self.pool.vault_registered = True
            self.pool.save(update_fields=["vault_registered"])
        with mock.patch.object(pool_views, "parse_invoke", return_value=(fn_name, args)), \
                mock.patch.object(pool_views, "submit_vault_tx", return_value={"hash": "abc"}) as submit:
            response = self.client.post(
                reverse("pool-vault-submit", args=[self.pool.short_code]),
                {"signed_xdr": "xdr-firmado"},
                format="json",
            )
        return response, submit

    def test_submit_create_pool_confirma_y_marca_registrado(self):
        response, submit = self._submit(
            "create_pool", ["testpool01", WALLET, 100 * 10_000_000, 0]
        )
        self.assertEqual(response.status_code, 200)
        submit.assert_called_once()
        self.pool.refresh_from_db()
        self.assertTrue(self.pool.vault_registered)

    def test_submit_create_pool_con_otro_owner_se_rechaza(self):
        response, submit = self._submit("create_pool", ["testpool01", CREATOR, 0, 0])
        self.assertEqual(response.status_code, 422)
        submit.assert_not_called()

    def test_submit_deposit_revalida_auto_donacion_solo_con_el_xdr(self):
        # El body no dice nada: el donor se lee del XDR firmado.
        response, submit = self._submit(
            "deposit", ["testpool01", CREATOR, "sac", 5 * 10_000_000], registered=True
        )
        self.assertEqual(response.status_code, 422)
        submit.assert_not_called()

        response, submit = self._submit(
            "deposit", ["testpool01", DONOR, "sac", 5 * 10_000_000], registered=True
        )
        self.assertEqual(response.status_code, 200)

    def test_submit_withdraw_revalida_owner_desde_el_xdr(self):
        response, submit = self._submit(
            "withdraw", ["testpool01", CREATOR, "sac", DONOR, 1], registered=True
        )
        self.assertEqual(response.status_code, 422)
        submit.assert_not_called()

    def test_submit_de_otro_pool_se_rechaza(self):
        response, submit = self._submit("deposit", ["otropool00", DONOR, "sac", 1], registered=True)
        self.assertEqual(response.status_code, 422)
        submit.assert_not_called()

    def test_estado_del_vault(self):
        state = {"registered": True, "owner": WALLET, "assets": []}
        with mock.patch.object(pool_views, "get_vault_state", return_value=state):
            response = self.client.get(
                reverse("pool-vault-state", args=[self.pool.short_code])
            )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["registered"])


class VaultLeaderboardViewTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.pool = Pool.objects.create(
            short_code="leaderpool",
            wallet_address=WALLET,
            title="Pool con leaderboard",
            creator=CREATOR,
            vault_registered=True,
        )

    def test_devuelve_el_top_de_donantes_del_contrato(self):
        donors = [
            {"public_key": DONOR, "donated_xlm_equivalent": "50"},
            {"public_key": CREATOR, "donated_xlm_equivalent": "30"},
        ]
        with mock.patch.object(pool_views, "get_vault_leaderboard", return_value=donors):
            response = self.client.get(
                reverse("pool-vault-leaderboard", args=[self.pool.short_code])
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["donors"][0]["public_key"], DONOR)
        self.assertEqual(response.json()["donors"][0]["donated_xlm_equivalent"], "50")

    def test_pool_inexistente_da_404(self):
        response = self.client.get(
            reverse("pool-vault-leaderboard", args=["nopoool12"])
        )
        self.assertEqual(response.status_code, 404)

    def test_soroban_caido_da_503(self):
        with mock.patch.object(
            pool_views, "get_vault_leaderboard", side_effect=pool_views.VaultUnavailableError()
        ):
            response = self.client.get(
                reverse("pool-vault-leaderboard", args=[self.pool.short_code])
            )
        self.assertEqual(response.status_code, 503)


class DeadlineTests(APITestCase):
    def setUp(self):
        self.client = APIClient()

    def _create(self, body):
        with mock.patch.object(
            pool_views, "get_latest_horizon_cursor", return_value="cursor0"
        ):
            return self.client.post(reverse("pool-create"), body, format="json")

    def test_crear_pool_con_deadline(self):
        response = self._create(
            {
                "wallet_address": WALLET,
                "title": "Pool con fecha",
                "creator": CREATOR,
                "deadline": "2036-01-01T00:00:00Z",
            }
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["pool"]["deadline"], "2036-01-01T00:00:00Z")

    def test_deadline_es_opcional(self):
        response = self._create(
            {"wallet_address": WALLET, "title": "Pool sin fecha", "creator": CREATOR}
        )
        self.assertEqual(response.status_code, 201)
        self.assertIsNone(response.json()["pool"]["deadline"])

    def test_deadline_invalido_da_400(self):
        response = self._create(
            {
                "wallet_address": WALLET,
                "title": "Pool con fecha rota",
                "creator": CREATOR,
                "deadline": "no-es-una-fecha",
            }
        )
        self.assertEqual(response.status_code, 400)



