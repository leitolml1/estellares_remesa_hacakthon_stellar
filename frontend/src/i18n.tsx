import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type Locale = 'es' | 'en'

const STORAGE_KEY = 'remesa.locale'

export function getLocale(): Locale {
  if (typeof localStorage === 'undefined') return 'es'
  return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'es'
}

export function tx(es: string, en: string): string {
  return getLocale() === 'en' ? en : es
}

type LocaleContextValue = {
  locale: Locale
  setLocale: (next: Locale) => void
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getLocale)

  const setLocale = useCallback((next: Locale) => {
    localStorage.setItem(STORAGE_KEY, next)
    setLocaleState(next)
    document.documentElement.lang = next
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
    const description = document.querySelector('meta[name="description"]')
    if (description) {
      description.setAttribute(
        'content',
        locale === 'en'
          ? 'Estelares — remittances without borders. Payments, community pools and family savings on Stellar.'
          : 'Estelares — remesas sin fronteras. Envíos, pools comunitarios y ahorro familiar sobre Stellar.',
      )
    }
  }, [locale])

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale])

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useI18n() {
  const context = useContext(LocaleContext)
  if (!context) {
    throw new Error('useI18n must be used within LocaleProvider')
  }
  return context
}
