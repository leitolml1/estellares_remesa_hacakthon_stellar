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


class RecurringTransfer(models.Model):
    """Regla de remesa recurrente ("enviar X a mamá cada mes").

    SIN CUSTODIA: el backend no puede firmar nada, asi que no hay debito
    automatico. La regla guarda la intencion (frecuencia + proxima fecha)
    y el frontend la usa para recordarle al usuario pagar, con el pago
    pre-armado (SEP-7 / formularios precargados) para que firme su wallet.
    """

    FREQUENCIES = (
        ("weekly", "Semanal"),
        ("biweekly", "Quincenal"),
        ("monthly", "Mensual"),
    )

    sender = models.CharField(max_length=STELLAR_PUBLIC_KEY_LENGTH, db_index=True)
    receiver = models.CharField(max_length=STELLAR_PUBLIC_KEY_LENGTH)
    amount = models.CharField(max_length=32)
    asset_code = models.CharField(max_length=8, default="XLM")
    frequency = models.CharField(max_length=16, choices=FREQUENCIES)
    next_run_at = models.DateTimeField()
    last_paid_at = models.DateTimeField(blank=True, null=True)
    note = models.CharField(max_length=140, blank=True, default="")
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["next_run_at"]
        indexes = [
            models.Index(fields=["sender", "active"]),
        ]

    def __str__(self) -> str:
        return f"{self.amount} {self.asset_code} {self.frequency} ({self.sender[:6]}... -> {self.receiver[:6]}...)"
