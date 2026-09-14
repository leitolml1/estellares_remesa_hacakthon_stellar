from django.db import models

STELLAR_PUBLIC_KEY_LENGTH = 56


class FamilyPool(models.Model):
    """Caja de ahorro familiar con retiro multi-firma (Modulo 3).

    La cuenta del pool es una cuenta Stellar clasica configurada con
    setOptions (multisig nativo, sin contrato propio): cada familiar es un
    signer con un weight, `med_threshold` protege los retiros (operaciones
    Payment) y `high_threshold` protege cambios futuros al multisig en si
    mismo (agregar/sacar signers, cambiar weights o thresholds) - se fija
    igual a la suma de todos los weights, o sea hace falta acuerdo unanime
    de la familia para tocar la config, no alcanza con el quorum de retiro.

    La master key original de la cuenta (generada efimera del lado del
    cliente solo para el bootstrap) se pone en weight 0 al terminar el
    setup: no queda ninguna llave "maestra" oculta, solo los signers
    declarados en este registro controlan la cuenta.

    signers/med_threshold/high_threshold se guardan como snapshot de lo
    que confirmo Horizon al crear este registro (ver
    family_pools.stellar_client.confirm_pool_setup) - el ledger sigue
    siendo la fuente de verdad, esto es cache para no repetir la consulta
    a Horizon en cada GET simple.
    """

    pool_account = models.CharField(max_length=STELLAR_PUBLIC_KEY_LENGTH, unique=True)
    title = models.CharField(max_length=140)
    creator = models.CharField(max_length=STELLAR_PUBLIC_KEY_LENGTH)

    signers = models.JSONField()  # [{"public_key": "G...", "weight": 1}, ...]
    med_threshold = models.PositiveSmallIntegerField()
    high_threshold = models.PositiveSmallIntegerField()

    # Tope de monto por retiro: el multisig nativo de Stellar no valida
    # montos (el protocolo no sabe de "limites por operacion"), asi que
    # esto lo hace 100% el backend antes de armar la tx de retiro y pedir
    # las firmas (Modulo 3, paso 2).
    withdrawal_limit = models.CharField(max_length=32)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.pool_account} ({self.title})"


class FamilyPoolDeposit(models.Model):
    """Metadata de un deposito ya confirmado en el ledger hacia la cuenta
    de un FamilyPool. Depositar no requiere ninguna firma de la cuenta del
    pool - cualquier cuenta externa puede pagarle libremente aunque no sea
    signer - asi que esta metadata solo se guarda despues de verificar
    contra Horizon que la tx exista y sea realmente un pago a esta cuenta
    (mismo patron que el guardado de metadata de pagos del Modulo 1).
    """

    pool = models.ForeignKey(FamilyPool, related_name="deposits", on_delete=models.CASCADE)
    depositor = models.CharField(max_length=STELLAR_PUBLIC_KEY_LENGTH)
    tx_hash = models.CharField(max_length=64, unique=True)
    note = models.CharField(max_length=280, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.tx_hash} -> {self.pool.pool_account}"
