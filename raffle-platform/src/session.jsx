import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { getUser } from './api/server.js'
import { useDb } from './hooks.js'

// Demo login: each browser tab keeps its own session, so you can be a buyer
// in one tab, a seller in another and the admin in a third. The real app uses
// mobile number + OTP, and sellers are bound to their registered POS device.
const SessionContext = createContext(null)
const KEY = 'raffle-session'

function readSession() {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function SessionProvider({ children }) {
  useDb()
  const [userId, setUserId] = useState(readSession)
  const login = useCallback((id) => {
    try {
      sessionStorage.setItem(KEY, id)
    } catch {
      /* private mode: session lasts until reload */
    }
    setUserId(id)
  }, [])
  const logout = useCallback(() => {
    try {
      sessionStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
    setUserId(null)
  }, [])
  const user = userId ? getUser(userId) : null
  const value = useMemo(() => ({ user, login, logout }), [user, login, logout])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  return useContext(SessionContext)
}

export function homeFor(role) {
  if (role === 'seller') return '/pos'
  if (role === 'operator' || role === 'super_admin') return '/admin'
  return '/buyer'
}
