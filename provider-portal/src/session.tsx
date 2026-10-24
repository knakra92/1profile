import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, setUnauthorizedHandler, tokenStore, type ScopeCatalog, type User } from './api'

interface Session {
  user: User | null
  loading: boolean
  scopes: ScopeCatalog
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const SessionContext = createContext<Session | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [scopes, setScopes] = useState<ScopeCatalog>({})

  const logout = useCallback(() => {
    tokenStore.clear()
    setUser(null)
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(logout)
    if (!tokenStore.get()) {
      setLoading(false)
      return
    }
    api<User>('/auth/me')
      .then((u) => (u.role === 'provider' ? setUser(u) : logout()))
      .catch(() => logout())
      .finally(() => setLoading(false))
  }, [logout])

  useEffect(() => {
    if (user) api<ScopeCatalog>('/provider/scopes').then(setScopes).catch(() => {})
  }, [user])

  const login = async (email: string, password: string) => {
    const res = await api<{ access_token: string; user: User }>('/auth/login', { body: { email, password } })
    if (res.user.role !== 'provider') {
      throw new Error('This is a 1Profile member account. Members use the 1Profile app — this portal is for provider staff.')
    }
    tokenStore.set(res.access_token)
    setUser(res.user)
  }

  return <SessionContext.Provider value={{ user, loading, scopes, login, logout }}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession outside SessionProvider')
  return ctx
}

export function scopeLabel(scopes: ScopeCatalog, key: string) {
  return scopes[key]?.label ?? key
}
