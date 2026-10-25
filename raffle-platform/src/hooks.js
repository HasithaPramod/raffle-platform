import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { getVersion, subscribe } from './api/store.js'

// Re-render whenever the database changes (in this tab or another tab).
export function useDb() {
  return useSyncExternalStore(subscribe, getVersion)
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

// Wraps an async API call with busy and error state.
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = useCallback(async (fn) => {
    setBusy(true)
    setError('')
    try {
      return await fn()
    } catch (e) {
      setError(e.message || 'Something went wrong.')
      return undefined
    } finally {
      setBusy(false)
    }
  }, [])
  return { busy, error, setError, run }
}
