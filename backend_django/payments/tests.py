"""Tests del cotizador `payments.quotes` + su vista, y del CRUD de
remesas recurrentes.

El strict-send path finding de Horizon va mockeado: los tests verifican
que la quote prefiera el camino DEX cuando existe, caiga a la tasa
referencial cuando no, y respete el pago directo (mismo asset) sin
necesitar ningun camino.
"""

from decimal import Decimal
from unittest import mock

from django.test import SimpleTestCase
from django.urls import reverse
from rest_framework.test import APIClient, APITestCase

from . import quotes


class _FakeStrictSendBuilder:
    def __init__(self, records, error=None):
        self._records = records
        self._error = error

    def call(self):
        if self._error is not None:
            raise self._error
        return {"_embedded": {"records": self._records}}


class _FakeServer:
    def __init__(self, records=None, error=None):
        self._records = records
        self._error = error

    def strict_send_paths(self, source_asset, source_amount, destination):
        return _FakeStrictSendBuilder(self._records, self._error)


class QuoteLogicTests(SimpleTestCase):
    def test_mismo_asset_es_pago_directo_sin_consultar_horizon(self):
        server = _FakeServer()
        with mock.patch.object(quotes, "get_server", return_value=server):
            quote = quotes.get_quote("USDC", "USDC", Decimal("5"))
        self.assertEqual(quote["source"], "direct")
        self.assertEqual(quote["dest_amount"], "5.0000000")
        self.assertEqual(quote["dest_min"], "4.9500000")
        self.assertEqual(quote["rate"], "1.0000000")

    def test_dex_gana_cuando_hay_camion_en_banda(self):
        # 2 XLM -> referencial 0.2 USDC; 0.199 esta dentro de la banda [0.1, 0.4]
        server = _FakeServer(records=[{"destination_amount": "0.1990000"}])
        with mock.patch.object(quotes, "get_server", return_value=server):
            quote = quotes.get_quote("XLM", "USDC", Decimal("2"))
        self.assertEqual(quote["source"], "dex")
        self.assertEqual(quote["dest_amount"], "0.1990000")
        self.assertEqual(quote["dest_min"], "0.1970100")

    def test_dex_con_precio_absurdo_cae_a_tasa_referencial(self):
        # 19.8 USDC por 2 XLM es 99x la tasa referencial: liquidez de juguete
        server = _FakeServer(records=[{"destination_amount": "19.8000000"}])
        with mock.patch.object(quotes, "get_server", return_value=server):
            quote = quotes.get_quote("XLM", "USDC", Decimal("2"))
        self.assertEqual(quote["source"], "reference")
        self.assertEqual(quote["dest_amount"], "0.2000000")

    def test_sin_camino_cae_a_tasa_referencial_xlm_a_usdc(self):
        server = _FakeServer(records=[])
        with mock.patch.object(quotes, "get_server", return_value=server):
            quote = quotes.get_quote("XLM", "USDC", Decimal("2"))
        self.assertEqual(quote["source"], "reference")
        self.assertEqual(quote["dest_amount"], "0.2000000")
        self.assertEqual(quote["dest_min"], "0.1980000")

    def test_fallback_referencial_usdc_a_xlm(self):
        server = _FakeServer(error=Exception("horizon caido"))
        with mock.patch.object(quotes, "get_server", return_value=server):
            quote = quotes.get_quote("USDC", "XLM", Decimal("2"))
        self.assertEqual(quote["source"], "reference")
        self.assertEqual(quote["dest_amount"], "20.0000000")

    def test_fallback_referencial_usdc_a_eurc_pasa_por_xlm(self):
        server = _FakeServer(records=[])
        with mock.patch.object(quotes, "get_server", return_value=server):
            quote = quotes.get_quote("USDC", "EURC", Decimal("2"))
        self.assertEqual(quote["source"], "reference")
        # 2 USDC * 10 = 20 XLM; 20 / 11 = 1.8181818 (truncado, no redondeado)
        self.assertEqual(quote["dest_amount"], "1.8181818")
        # 20/11 * 0.99 = 1.8 exacto: el buffer se aplica a precision completa
        self.assertEqual(quote["dest_min"], "1.8000000")

    def test_asset_no_soportado_se_rechaza(self):
        with self.assertRaises(quotes.UnsupportedAssetError):
            quotes.get_quote("BTC", "XLM", Decimal("1"))

    def test_dest_min_no_se_redondea_para_arriba(self):
        # 1.8181818 * 0.99 = 1.799999982 -> floor a 7 decimales
        quote = quotes.get_quote("EURC", "EURC", Decimal("1.8181818"))
        self.assertEqual(quote["dest_min"], "1.7999999")


class QuoteViewTests(SimpleTestCase):
    def setUp(self):
        self.client = APIClient()

    def _quote(self, query):
        url = reverse("payment-quote")
        return self.client.get(url, query)

    def test_quote_cross_asset(self):
        server = _FakeServer(records=[])
        with mock.patch.object(quotes, "get_server", return_value=server):
            response = self._quote(
                {"send_asset": "XLM", "dest_asset": "USDC", "amount": "10"}
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["source"], "reference")
        self.assertEqual(response.json()["dest_amount"], "1.0000000")
        self.assertEqual(response.json()["dest_min"], "0.9900000")

    def test_asset_invalido_da_400(self):
        response = self._quote(
            {"send_asset": "BTC", "dest_asset": "XLM", "amount": "1"}
        )
        self.assertEqual(response.status_code, 400)

    def test_monto_cero_da_400(self):
        response = self._quote(
            {"send_asset": "XLM", "dest_asset": "USDC", "amount": "0"}
        )
        self.assertEqual(response.status_code, 400)

    def test_monto_con_ocho_decimales_da_400(self):
        response = self._quote(
            {"send_asset": "XLM", "dest_asset": "USDC", "amount": "1.00000001"}
        )
        self.assertEqual(response.status_code, 400)

    def test_monto_faltante_da_400(self):
        response = self._quote({"send_asset": "XLM", "dest_asset": "USDC"})
        self.assertEqual(response.status_code, 400)


SENDER = "GA7YOVSW63BEGKYD7SIPDIX5N5HPCESSAHEU2ZKZD6X6KCMD6HHMEWVU"
RECEIVER = "GATBY4ZPTJDMHHKO4RGZKLABG2FWATOYN72FN5A2ERSCFQ3OBZD7IJFB"
OTHER = "GCHQ5FJUSFTEYNSDO25VFYSQQKZ2TDH2JO2XSGKKLLFGNQ3HL4ZODJOS"


class RecurringViewTests(APITestCase):
    """CRUD de remesas recurrentes: validaciones + guard ad-hoc por
    sender_public_key (mismo patron que family_pools mientras no haya
    auth real). Sin Horizon: no consulta nada de la red."""

    def setUp(self):
        self.client = APIClient()
        self.base = {
            "sender": SENDER,
            "receiver": RECEIVER,
            "amount": "50",
            "asset_code": "USDC",
            "frequency": "monthly",
        }

    def _create(self, body=None):
        return self.client.post(
            reverse("recurring-list-create"), body or self.base, format="json"
        )

    def test_crear_regla_con_proxima_fecha_automatica(self):
        response = self._create()
        self.assertEqual(response.status_code, 201)
        rule = response.json()
        self.assertEqual(rule["sender"], SENDER)
        self.assertEqual(rule["asset_code"], "USDC")
        self.assertTrue(rule["active"])
        self.assertIsNotNone(rule["next_run_at"])
        self.assertIsNone(rule["last_paid_at"])

    def test_crear_regla_con_primera_fecha_custom(self):
        response = self._create({**self.base, "next_run_at": "2036-05-01T12:00:00Z"})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["next_run_at"], "2036-05-01T12:00:00Z")

    def test_crear_regla_para_si_mismo_da_400(self):
        response = self._create({**self.base, "receiver": SENDER})
        self.assertEqual(response.status_code, 400)

    def test_frecuencia_invalida_da_400(self):
        response = self._create({**self.base, "frequency": "anual"})
        self.assertEqual(response.status_code, 400)

    def test_amount_invalido_da_400(self):
        response = self._create({**self.base, "amount": "0"})
        self.assertEqual(response.status_code, 400)
        response = self._create({**self.base, "amount": "1.00000001"})
        self.assertEqual(response.status_code, 400)

    def test_listar_filtra_por_sender(self):
        self.client.post(reverse("recurring-list-create"), self.base, format="json")
        self.client.post(
            reverse("recurring-list-create"),
            {**self.base, "sender": OTHER, "receiver": SENDER, "frequency": "weekly"},
            format="json",
        )
        response = self.client.get(
            reverse("recurring-list-create"), {"public_key": SENDER}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["records"]), 1)
        self.assertEqual(response.json()["records"][0]["sender"], SENDER)

    def test_filtro_due_devuelve_solo_vencidas(self):
        self.client.post(
            reverse("recurring-list-create"),
            {**self.base, "next_run_at": "2020-01-01T00:00:00Z"},
            format="json",
        )
        self.client.post(
            reverse("recurring-list-create"),
            {**self.base, "next_run_at": "2099-01-01T00:00:00Z", "frequency": "weekly"},
            format="json",
        )
        response = self.client.get(
            reverse("recurring-list-create"), {"public_key": SENDER, "due": "true"}
        )
        records = response.json()["records"]
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["frequency"], "monthly")

    def test_marcar_pagado_corre_la_proxima_fecha(self):
        rule = self.client.post(
            reverse("recurring-list-create"),
            {**self.base, "next_run_at": "2020-01-01T00:00:00Z"},
            format="json",
        ).json()
        response = self.client.patch(
            reverse("recurring-detail", args=[rule["id"]]),
            {"paid": True, "sender_public_key": SENDER},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIsNotNone(body["last_paid_at"])
        next_run = body["next_run_at"]
        self.assertGreaterEqual(next_run, "2026")

    def test_patch_por_otra_persona_da_403(self):
        rule = self.client.post(reverse("recurring-list-create"), self.base, format="json").json()
        response = self.client.patch(
            reverse("recurring-detail", args=[rule["id"]]),
            {"active": False, "sender_public_key": OTHER},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_toggle_active(self):
        rule = self.client.post(reverse("recurring-list-create"), self.base, format="json").json()
        response = self.client.patch(
            reverse("recurring-detail", args=[rule["id"]]),
            {"active": False, "sender_public_key": SENDER},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["active"])

    def test_delete_por_otra_persona_da_403(self):
        rule = self.client.post(reverse("recurring-list-create"), self.base, format="json").json()
        response = self.client.delete(
            reverse("recurring-detail", args=[rule["id"]]),
            {"sender_public_key": OTHER},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        response = self.client.delete(
            reverse("recurring-detail", args=[rule["id"]]),
            {"sender_public_key": SENDER},
            format="json",
        )
        self.assertEqual(response.status_code, 204)
        response = self.client.get(reverse("recurring-list-create"), {"public_key": SENDER})
        self.assertEqual(len(response.json()["records"]), 0)
