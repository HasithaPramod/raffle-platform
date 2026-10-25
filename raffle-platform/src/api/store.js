// Persistence for the in-browser mock backend.
// The whole database is one JSON object kept in localStorage and shared
// across tabs with BroadcastChannel, which stands in for the WebSocket push
// the real backend will use (open the buyer live-draw page in one tab and
// the admin draw control in another to see results arrive live).

const KEY = 'raffle-db-v4' // bump when the data shape changes; old data is reseeded
const memory = new Map()

const memoryStorage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: (k) => memory.delete(k) }

// Falls back to memory where localStorage is missing or blocked (tests,
// private windows, some embedded previews).
function pickStorage() {
  try {
    const ls = globalThis.localStorage
    if (!ls) return memoryStorage
    ls.setItem('__raffle_probe', '1')
    ls.removeItem('__raffle_probe')
    return ls
  } catch {
    return memoryStorage
  }
}
const storage = pickStorage()

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('raffle-db') : null
channel?.unref?.() // Node (tests): don't keep the process alive
const listeners = new Set()
let db = null
let version = 0

function emit() {
  version++
  listeners.forEach((fn) => fn(version))
}

if (channel) {
  channel.onmessage = () => {
    db = null // reload from storage on next read
    emit()
  }
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      db = null
      emit()
    }
  })
}

export function readDb() {
  if (!db) {
    const raw = storage.getItem(KEY)
    db = raw ? JSON.parse(raw) : null
  }
  return db
}

export function writeDb(next) {
  db = next
  storage.setItem(KEY, JSON.stringify(next))
  channel?.postMessage('changed')
  emit()
}

export function resetDb() {
  db = null
  storage.removeItem(KEY)
  channel?.postMessage('changed')
  emit()
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getVersion() {
  return version
}
