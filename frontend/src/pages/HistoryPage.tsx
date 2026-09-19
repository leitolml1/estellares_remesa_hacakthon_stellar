import { animate, stagger } from 'animejs'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { FormPanel, PageStage } from '../components/layout/PageStage'
import { WalletGate } from '../components/WalletGate'
import { Alert } from '../components/ui/Alert'
import { AssetLogo } from '../components/ui/AssetLogo'
import { Button } from '../components/ui/Button'
import { Field, TextInput } from '../components/ui/Field'
import { IconExternal, IconFilter, IconReceive, IconSend } from '../components/ui/Icons'
import { Spinner } from '../components/ui/Spinner'
import { useUnfoldDown } from '../hooks/useUnfoldDown'
import { useWallet } from '../context/WalletContext'
import { getPaymentHistory, humanizeApiError } from '../lib/api'
import { displayAssetCode, type KnownAssetCode } from '../lib/assets'
import { saveContact } from '../lib/contacts'
import {
  explorerTxUrl,
  formatAmount,
  formatDate,
  truncateKey,
} from '../lib/format'
import { getFamilyLabels, getSavedFamilyPools } from '../lib/storage'
import type { PaymentRecord } from '../types'

const ASSET_FILTERS: Array<'all' | KnownAssetCode> = ['all', 'XLM', 'USDC', 'EURC']
const TYPE_FILTERS: Array<{ id: 'all' | 'in' | 'out'; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'out', label: 'Enviados' },
  { id: 'in', label: 'Recibidos' },
]

export function HistoryPage() {
  return (
    <PageStage
      className="page-stage-history"
      title="Historial de movimientos"
      subtitle="Tus envíos y lo que llegó, con la nota que hayas guardado. Montos leídos de la red Stellar."
    >
      <WalletGate
        title="Conectá para ver el historial"
        description="Los montos salen de la red. Las notas las guardamos nosotros."
      >
        <HistoryContent />
      </WalletGate>
    </PageStage>
  )
}

function HistoryContent() {
  const { publicKey } = useWallet()
  const [records, setRecords] = useState<PaymentRecord[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [direction, setDirection] = useState<'all' | 'in' | 'out'>('all')
  const [asset, setAsset] = useState<'all' | KnownAssetCode>('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reveal = useUnfoldDown('history')
  const tableRef = useRef<HTMLTableSectionElement>(null)
  const nicknames = useMemo(() => collectNicknames(), [])
  const [savedContacts, setSavedContacts] = useState<string[]>([])

  function addContact(publicKey: string) {
    const contact = saveContact(publicKey, nicknames[publicKey] ?? '')
    if (contact) {
      setSavedContacts((current) =>
        current.includes(publicKey) ? current : [...current, publicKey],
      )
    }
  }

  async function load(next?: string, replace = false) {
    if (!publicKey) return
    setLoading(true)
    setError(null)
    try {
      const page = await getPaymentHistory(publicKey, {
        limit: 20,
        cursor: next,
      })
      setRecords((current) =>
        replace ? page.records : [...current, ...page.records],
      )
      setCursor(page.nextCursor)
    } catch (caught) {
      setError(humanizeApiError(caught))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!publicKey) return
    void load(undefined, true)
  }, [publicKey])

  const filtered = records.filter((record) => {
    if (direction === 'in' && record.to !== publicKey) return false
    if (direction === 'out' && record.from !== publicKey) return false
    if (asset !== 'all' && displayAssetCode(record.assetCode) !== asset) {
      return false
    }
    if (note.trim()) {
      const haystack = `${record.note ?? ''} ${record.memo ?? ''} ${record.category ?? ''}`.toLowerCase()
      if (!haystack.includes(note.trim().toLowerCase())) return false
    }
    return true
  })

  const summary = useMemo(() => {
    if (!publicKey) {
      return { monthCount: 0, xlmIn: 0, xlmOut: 0 }
    }
    const now = new Date()
    const monthRecords = records.filter((record) => {
      const date = new Date(record.createdAt)
      return (
        date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
      )
    })
    let xlmIn = 0
    let xlmOut = 0
    for (const record of monthRecords) {
      const code = displayAssetCode(record.assetCode)
      if (code !== 'XLM') continue
      const amount = Number(record.amount)
      if (!Number.isFinite(amount)) continue
      if (record.to === publicKey) xlmIn += amount
      if (record.from === publicKey) xlmOut += amount
    }
    return { monthCount: monthRecords.length, xlmIn, xlmOut }
  }, [publicKey, records])

  useLayoutEffect(() => {
    const rows = tableRef.current?.querySelectorAll('tr')
    if (!rows || rows.length === 0) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    animate(rows, {
      opacity: [0, 1],
      translateX: [16, 0],
      delay: stagger(35),
      duration: 380,
      ease: 'out(3)',
    })
  }, [filtered.length, records.length])

  return (
    <div ref={reveal}>
    <FormPanel>
      <form
        className="grid gap-4 md:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault()
        }}
      >
        <Field label="Nota / categoría / dirección">
          <TextInput
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="alquiler, familia, G…"
          />
        </Field>
        <Field label="Tipo">
          <div className="history-filters" role="group" aria-label="Tipo de movimiento">
            {TYPE_FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`history-chip ${direction === item.id ? 'is-active' : ''}`}
                aria-pressed={direction === item.id}
                onClick={() => setDirection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Activo">
          <div className="history-filters" role="group" aria-label="Filtrar por activo">
            {ASSET_FILTERS.map((item) => (
              <button
                key={item}
                type="button"
                className={`history-chip ${asset === item ? 'is-active' : ''}`}
                aria-pressed={asset === item}
                onClick={() => setAsset(item)}
              >
                {item === 'all' ? 'Todos' : item}
              </button>
            ))}
          </div>
        </Field>
        <div className="flex items-end">
          <Button type="submit" disabled={loading}>
            <span className="inline-flex items-center gap-2">
              <IconFilter className="h-4 w-4" />
              Filtrar
            </span>
          </Button>
        </div>
      </form>

      <div className="history-strip">
        <div>
          <p>Este mes</p>
          <strong>{summary.monthCount}</strong>
          <span>movimientos</span>
        </div>
        <div>
          <p>Vol. recibido</p>
          <strong className="is-in">+{formatAmount(String(summary.xlmIn), 'XLM')}</strong>
          <span>solo XLM este mes</span>
        </div>
        <div>
          <p>Vol. enviado</p>
          <strong className="is-out">-{formatAmount(String(summary.xlmOut), 'XLM')}</strong>
          <span>solo XLM este mes</span>
        </div>
      </div>

      {error ? (
        <div className="mt-6">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}
      {loading && records.length === 0 ? (
        <div className="mt-8">
          <Spinner label="Leyendo pagos en Horizon…" />
        </div>
      ) : null}

      <div className="history-meta">
        <p>Mostrando {filtered.length} operaciones recientes</p>
        <p>Montos leídos de Horizon · notas nuestras</p>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-base">
          <thead className="text-sm uppercase tracking-[0.12em] text-purple-deep/70">
            <tr>
              <th className="pb-3">Fecha</th>
              <th className="pb-3">De / Para</th>
              <th className="pb-3">Monto</th>
              <th className="pb-3">Nota</th>
              <th className="pb-3">Tx</th>
            </tr>
          </thead>
          <tbody ref={tableRef}>
            {filtered.map((record) => {
              const outgoing = record.from === publicKey
              const counterpart = outgoing ? record.to : record.from
              const nickname = nicknames[counterpart]
              const primary =
                record.note?.trim() ||
                record.memo?.trim() ||
                nickname ||
                truncateKey(counterpart, 5)
              const showKey = primary !== truncateKey(counterpart, 5)
              return (
              <tr key={record.id} className="border-t border-purple/15">
                <td className="py-3 pr-4">{formatDate(record.createdAt)}</td>
                <td className="py-3 pr-4">
                  <div className="history-party">
                    <span className={`history-dir ${outgoing ? 'is-out' : 'is-in'}`}>
                      {outgoing ? (
                        <IconSend className="h-3.5 w-3.5" />
                      ) : (
                        <IconReceive className="h-3.5 w-3.5" />
                      )}
                      {outgoing ? 'Enviado' : 'Recibido'}
                    </span>
                    <span className="history-party-name">{primary}</span>
                    <span className="flex items-center gap-2">
                      {showKey ? (
                        <span className="history-party-key" title={counterpart}>
                          {truncateKey(counterpart, 5)}
                        </span>
                      ) : null}
                      {savedContacts.includes(counterpart) ? (
                        <span className="text-xs text-purple-deep/60">✓ contacto</span>
                      ) : (
                        <button
                          type="button"
                          className="text-xs text-purple underline"
                          onClick={() => addContact(counterpart)}
                          title="Guardar esta wallet en tu libreta de contactos"
                        >
                          + contacto
                        </button>
                      )}
                    </span>
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <span className="inline-flex items-center gap-2 font-semibold">
                    <AssetLogo
                      code={displayAssetCode(record.assetCode)}
                      className="h-5 w-5"
                    />
                    {outgoing ? '−' : '+'}
                    {formatAmount(
                      record.amount,
                      displayAssetCode(record.assetCode),
                    )}
                  </span>
                </td>
                <td className="py-3 pr-4 text-muted">
                  {record.note || record.category || '—'}
                </td>
                <td className="py-3">
                  <a
                    className="history-tx"
                    href={explorerTxUrl(record.transactionHash)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {truncateKey(record.transactionHash, 4)}
                    <IconExternal className="h-3.5 w-3.5" />
                  </a>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && !loading ? (
        <p className="mt-6 text-base text-purple-deep/70">No hay pagos con esos filtros.</p>
      ) : null}

      {cursor ? (
        <div className="mt-6">
          <Button variant="ghost" disabled={loading} onClick={() => void load(cursor)}>
            Cargar más
          </Button>
        </div>
      ) : null}
    </FormPanel>
    </div>
  )
}

function collectNicknames(): Record<string, string> {
  const names: Record<string, string> = {}
  for (const pool of getSavedFamilyPools()) {
    Object.assign(names, getFamilyLabels(pool.poolAccount))
  }
  return names
}
