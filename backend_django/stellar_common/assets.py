"""Assets admitidos en el proyecto (testnet), compartidos entre `pools`
(SEP-7) y `family_pools` (retiros/trustlines) para que los issuers vivan
en un solo lugar del backend.
"""

CIRCLE_TESTNET_ASSET_ISSUERS = {
    "USDC": "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    "EURC": "GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO",
}

# Equivalencia referencial asset -> XLM para comparar donaciones de
# cualquier asset contra una meta expresada en XLM. Hoy testnet no tiene
# mercado DEX para estos assets (0 pools de liquidez y 0 order books), asi
# que no hay precio on-chain que leer: son valores de referencia editables.
CIRCLE_TESTNET_XLM_REFERENCE_RATES = {
    "USDC": "10",
    "EURC": "11",
}
