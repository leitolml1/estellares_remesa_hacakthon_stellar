import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  connectFreighter,
  humanizeFreighterError,
  isFreighterAvailable,
} from '../lib/freighter'
import { getAccountBalance } from '../lib/horizon'
import type { AccountBalance } from '../types'

type WalletContextValue = {
  publicKey: string | null
  connecting: boolean
  available: boolean | null
  balances: AccountBalance | null
  balancesLoading: boolean
  error: string | null
  connect: () => Promise<void>
  disconnect: () => void
  refreshBalances: () => Promise<void>
}

const WalletContext = createContext<WalletContextValue | null>(null)

const STORAGE_KEY = 'remesa.wallet.publicKey'

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY),
  )
  const [connecting, setConnecting] = useState(false)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [balances, setBalances] = useState<AccountBalance | null>(null)
  const [balancesLoading, setBalancesLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void isFreighterAvailable().then((value) => {
      if (!cancelled) setAvailable(value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const refreshBalances = useCallback(async () => {
    if (!publicKey) {
      setBalances(null)
      return
    }
    setBalancesLoading(true)
    try {
      const result = await getAccountBalance(publicKey)
      setBalances(result)
    } catch {
      setBalances(null)
    } finally {
      setBalancesLoading(false)
    }
  }, [publicKey])

  useEffect(() => {
    void refreshBalances()
  }, [refreshBalances])

  const connect = useCallback(async () => {
    setConnecting(true)
    setError(null)
    try {
      const result = await connectFreighter()
      setPublicKey(result.publicKey)
      localStorage.setItem(STORAGE_KEY, result.publicKey)
    } catch (caught) {
      setError(humanizeFreighterError(caught))
    } finally {
      setConnecting(false)
    }
  }, [])

  const disconnect = useCallback(() => {
    setPublicKey(null)
    setBalances(null)
    setError(null)
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  const value = useMemo(
    () => ({
      publicKey,
      connecting,
      available,
      balances,
      balancesLoading,
      error,
      connect,
      disconnect,
      refreshBalances,
    }),
    [
      publicKey,
      connecting,
      available,
      balances,
      balancesLoading,
      error,
      connect,
      disconnect,
      refreshBalances,
    ],
  )

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  )
}

export function useWallet() {
  const context = useContext(WalletContext)
  if (!context) {
    throw new Error('useWallet debe usarse dentro de WalletProvider')
  }
  return context
}
