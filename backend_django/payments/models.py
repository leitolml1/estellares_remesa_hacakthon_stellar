from django.db import models

STELLAR_PUBLIC_KEY_LENGTH = 56
STELLAR_TX_HASH_LENGTH = 64


class Payment(models.Model):
    """Metadata de un pago P2P ya confirmado en el ledger de Stellar.

    El ledger (Horizon) es la fuente de verdad de monto/fecha/estado. Este
    modelo solo guarda lo que Horizon no tiene: nota y categoria del gasto.
    sender/receiver se guardan igual (copiados del ledger al momento de
    crear el registro) para poder filtrar/indexar sin volver a pegarle a
    Horizon por cada consulta de historial.
    """

    sender = models.CharField(max_length=STELLAR_PUBLIC_KEY_LENGTH)
    receiver = models.CharField(max_length=STELLAR_PUBLIC_KEY_LENGTH)
    tx_hash = models.CharField(max_length=STELLAR_TX_HASH_LENGTH, unique=True)
    note = models.CharField(max_length=280, blank=True, default="")
    category = models.CharField(max_length=64, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["sender"]),
            models.Index(fields=["receiver"]),
        ]

    def __str__(self) -> str:
        return f"{self.tx_hash} ({self.sender} -> {self.receiver})"
