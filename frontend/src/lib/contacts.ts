import type { Contact } from '../types'
import { isStellarPublicKey, truncateKey } from './format'

// Libreta de contactos en el dispositivo (localStorage): alias ->
// public key. Sin backend a proposito: no hay auth real todavia para
// sincronizar de forma segura entre dispositivos.
const CONTACTS_KEY = 'remesa.contacts.v1'
const MAX_CONTACTS = 100

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function getContacts(): Contact[] {
  return readJson<Contact[]>(CONTACTS_KEY, [])
}

export function findContact(publicKey: string): Contact | undefined {
  const key = publicKey.trim()
  return getContacts().find((contact) => contact.publicKey === key)
}

export function saveContact(publicKey: string, alias = ''): Contact | null {
  const key = publicKey.trim()
  if (!isStellarPublicKey(key)) return null
  const contacts = getContacts()
  const existing = contacts.find((contact) => contact.publicKey === key)
  const contact: Contact = {
    publicKey: key,
    alias: alias.trim() || existing?.alias || '',
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  }
  const next = [contact, ...contacts.filter((item) => item.publicKey !== key)]
  localStorage.setItem(
    CONTACTS_KEY,
    JSON.stringify(next.slice(0, MAX_CONTACTS)),
  )
  return contact
}

export function deleteContact(publicKey: string): void {
  const key = publicKey.trim()
  const next = getContacts().filter((contact) => contact.publicKey !== key)
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(next))
}

export function searchContacts(query: string, limit = 5): Contact[] {
  const clean = query.trim().toLowerCase()
  const contacts = getContacts()
  if (!clean) return contacts.slice(0, limit)
  const matches = contacts.filter(
    (contact) =>
      contact.alias.toLowerCase().includes(clean) ||
      contact.publicKey.toLowerCase().includes(clean),
  )
  return matches.slice(0, limit)
}

export function contactLabel(contact: Contact, edge = 4): string {
  return contact.alias || truncateKey(contact.publicKey, edge)
}
