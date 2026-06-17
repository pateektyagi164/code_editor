import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  bootstrapAccessToken,
  fetchAuthProviders,
  fetchCurrentUser,
  getOAuthLoginUrl,
  logoutUser,
} from '../services/api.js'

const AuthContext = createContext(null)
const AUTH_NEXT_KEY = 'code_collab_auth_next'

function resolveSafeNext(path) {
  if (!path || !path.startsWith('/')) {
    return '/'
  }
  return path
}

function AuthCallback() {
  const { completeOAuthCallback } = useAuth()

  useEffect(() => {
    completeOAuthCallback()
  }, [completeOAuthCallback])

  return (
    <div className="h-full flex items-center justify-center bg-slate-950">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 mx-auto border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Completing sign in…</p>
      </div>
    </div>
  )
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [providers, setProviders] = useState({ google: false, github: false })
  const [loading, setLoading] = useState(true)
  const [authState, setAuthState] = useState('checking')
  const [showLogin, setShowLogin] = useState(false)

  const isCallback = window.location.pathname === '/auth/callback'

  const loadUser = useCallback(async () => {
    try {
      const currentUser = await fetchCurrentUser()
      setUser(currentUser)
      setAuthState(currentUser ? 'authenticated' : 'anonymous')
      return currentUser
    } catch {
      setUser(null)
      setAuthState('anonymous')
      return null
    }
  }, [])

  const initAuth = useCallback(async () => {
    setLoading(true)

    try {
      try {
        const providerList = await fetchAuthProviders()
        setProviders(providerList)
      } catch {
        setProviders({ google: false, github: false })
      }

      const token = await bootstrapAccessToken({ forceRefresh: true })
      if (token && (await loadUser())) {
        return
      }

      setUser(null)
      setAuthState('anonymous')
    } catch {
      setUser(null)
      setAuthState('anonymous')
    } finally {
      setLoading(false)
    }
  }, [loadUser])

  useEffect(() => {
    if (isCallback) {
      return undefined
    }

    initAuth()
  }, [initAuth, isCallback])

  const completeOAuthCallback = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams(window.location.search)
    const nextFromQuery = params.get('next')
    const nextFromStorage = sessionStorage.getItem(AUTH_NEXT_KEY)
    const safeNext = resolveSafeNext(nextFromQuery || nextFromStorage || '/')
    sessionStorage.removeItem(AUTH_NEXT_KEY)

    try {
      await bootstrapAccessToken({ forceRefresh: true })
      await loadUser()
      window.location.replace(safeNext)
    } catch {
      setUser(null)
      setAuthState('anonymous')
      window.location.replace(safeNext)
    } finally {
      setLoading(false)
    }
  }, [loadUser])

  const login = useCallback((provider, nextPath) => {
    const next = resolveSafeNext(
      nextPath || `${window.location.pathname}${window.location.search}`,
    )
    sessionStorage.setItem(AUTH_NEXT_KEY, next)
    window.location.href = getOAuthLoginUrl(provider, next)
  }, [])

  const logout = useCallback(async () => {
    try {
      await logoutUser()
    } finally {
      Object.keys(localStorage)
        .filter((key) => key.startsWith('code_collab_'))
        .forEach((key) => localStorage.removeItem(key))
      setUser(null)
      setAuthState('anonymous')
      setShowLogin(false)
    }
  }, [])

  const value = useMemo(
    () => ({
      user,
      providers,
      loading,
      authState,
      isAuthenticated: !!user,
      showLogin,
      setShowLogin,
      login,
      logout,
      completeOAuthCallback,
    }),
    [user, providers, loading, authState, showLogin, login, logout, completeOAuthCallback],
  )

  if (isCallback) {
    return (
      <AuthContext.Provider value={value}>
        <AuthCallback />
      </AuthContext.Provider>
    )
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
