from django.db import models
from nanoid import generate as generate_nanoid

STELLAR_PUBLIC_KEY_LENGTH = 56
SHORT_CODE_LENGTH = 10  # nanoid; muy por debajo del limite ~28 bytes del memo de Stellar


def generate_short_code() -> str:
    return generate_nanoid(size=SHORT_CODE_LENGTH)


class Pool(models.Model):
    """Pool comunitario ("vaquita"): cualquiera dona escaneando un QR con un
    URI SEP-7, sin registrarse en la app. El memo de Stellar tiene ~28
    bytes (no entra un uuid), por eso las donaciones se identifican con
    este short_code corto en vez de con el id del pool.
    """

    short_code = models.CharField(
        max_length=SHORT_CODE_LENGTH, unique=True, default=generate_short_code, editable=False
    )
    wallet_address = models.CharField(max_length=STELLAR_PUBLIC_KEY_LENGTH)
    title = models.CharField(max_length=140)
    goal_amount = models.CharField(max_length=32, blank=True, null=True)
    creator = models.CharField(max_length=STELLAR_PUBLIC_KEY_LENGTH)

    # Cache incremental del progreso de donaciones: no es una fuente de
    # verdad propia (se puede reconstruir del todo con solo resetear
    # donations_synced_cursor), es un indice sobre el ledger para no
    # recorrer todo el historial de la wallet en cada consulta. Se
    # actualiza en cada GET via stellar_client.get_pool_with_synced_progress,
    # pidiendole a Horizon solo lo nuevo desde el ultimo cursor guardado.
    donation_count = models.PositiveIntegerField(default=0)
    total_donated_by_asset = models.JSONField(default=dict, blank=True)
    donations_synced_cursor = models.CharField(max_length=64, blank=True, null=True)

    # True una vez que la wallet del pool firmo el create_pool del vault
    # comunitario (contrato Soroban propio, ver pools/vault_client.py).
    # Los pools creados antes del vault no lo tienen, y siguen funcionando
    # con el modelo clasico de donaciones directo a la wallet.
    vault_registered = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.short_code} ({self.title})"
