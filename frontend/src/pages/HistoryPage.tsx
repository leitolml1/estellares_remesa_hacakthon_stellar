import { animate, stagger } from 'animejs'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FormPanel, PageStage } from '../components/layout/PageStage'
import { WalletGate } from '../components/WalletGate'
import { Alert } from '../components/ui/Alert'
import { AssetLogo } from '../components/ui/AssetLogo'
import { Button } from '../components/ui/Button'
import { Field, TextInput, formControlClass } from '../components/ui/Field'
import { Spinner } from '../components/ui/Spinner'
import { useUnfoldDown } from '../hooks/useUnfoldDown'
import { useWallet } from '../context/WalletContext'
import { getPaymentHistory, humanizeApiError } from '../lib/api'
import { displayAssetCode } from '../lib/assets'
import {
  explorerTxUrl,
  formatAmount,
  formatDate,
  truncateKey,
} from '../lib/format'
import type { PaymentRecord } from '../types'

export function HistoryPage() {
  return (
    <PageStage
      kicker="Módulo 1"
      title="HISTORIAL"
      subtitle="Django lee Horizon y le pega la nota/categoría que hayas guardado."
    >
      <WalletGate
        title="Conectá para ver el historial"
        description="Los montos salen del ledger. Las notas las guarda Django."
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
  const [asset, setAsset] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reveal = useUnfoldDown('history')
  const tableRef = useRef<HTMLTableSectionElement>(null)

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
    if (asset && record.assetCode.toLowerCase() !== asset.toLowerCase()) {
      return false
    }
    if (note.trim()) {
      const haystack = `${record.note ?? ''} ${record.memo ?? ''} ${record.category ?? ''}`.toLowerCase()
      if (!haystack.includes(note.trim().toLowerCase())) return false
    }
    return true
  })

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
          void load(undefined, true)
        }}
      >
        <Field label="Nota / categoría">
          <TextInput
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="alquiler, familia…"
          />
        </Field>
        <Field label="Dirección">
          <select
            className={formControlClass}
            value={direction}
            onChange={(event) =>
              setDirection(event.target.value as 'all' | 'in' | 'out')
            }
          >
            <option value="all">Todas</option>
            <option value="in">Entrantes</option>
            <option value="out">Salientes</option>
          </select>
        </Field>
        <Field label="Asset">
          <TextInput
            value={asset}
            onChange={(event) => setAsset(event.target.value)}
            placeholder="XLM, USDC…"
          />
        </Field>
        <div className="flex items-end">
          <Button type="submit" disabled={loading}>
            Aplicar
          </Button>
        </div>
      </form>

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

      <div className="mt-8 overflow-x-auto">
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
            {filtered.map((record) => (
              <tr key={record.id} className="border-t border-purple/15">
                <td className="py-3 pr-4">{formatDate(record.createdAt)}</td>
                <td className="py-3 pr-4 font-mono text-xs">
                  {record.from === publicKey ? '→' : '←'}{' '}
                  {truncateKey(
                    record.from === publicKey ? record.to : record.from,
                    5,
                  )}
                </td>
                <td className="py-3 pr-4">
                  <span className="inline-flex items-center gap-2">
                    <AssetLogo
                      code={displayAssetCode(record.assetCode)}
                      className="h-5 w-5"
                    />
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
                    className="text-purple underline"
                    href={explorerTxUrl(record.transactionHash)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {truncateKey(record.transactionHash, 4)}
                  </a>
                </td>
              </tr>
            ))}
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
