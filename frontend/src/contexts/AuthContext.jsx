import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  bootstrapAccessToken,
  fetchAuthProviders,
  fetchCurrentUser,
  getOAuthLoginUrl,
  logoutUser,
} from '../services/api.js'

const AuthContext = createContext(null)

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
  const [showLogin, setShowLogin] = useState(false)

  const isCallback = window.location.pathname === '/auth/callback'

  const loadUser = useCallback(async () => {
    try {
      const currentUser = await fetchCurrentUser()
      setUser(currentUser)
    } catch {
      setUser(null)
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

      const token = await bootstrapAccessToken()
      if (token) {
        await loadUser()
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
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
    const nextPath = params.get('next') || '/'
    try {
      await bootstrapAccessToken()
      await loadUser()
      window.location.replace(nextPath.startsWith('/') ? nextPath : '/')
    } catch {
      setUser(null)
      window.location.replace(nextPath.startsWith('/') ? nextPath : '/')
    } finally {
      setLoading(false)
    }
  }, [loadUser])

  const login = useCallback((provider, nextPath = window.location.pathname) => {
    window.location.href = getOAuthLoginUrl(provider, nextPath)
  }, [])

  const logout = useCallback(async () => {
    try {
      await logoutUser()
    } finally {
      setUser(null)
      setShowLogin(false)
    }
  }, [])

  const value = useMemo(
    () => ({
      user,
      providers,
      loading,
      isAuthenticated: !!user,
      showLogin,
      setShowLogin,
      login,
      logout,
      completeOAuthCallback,
    }),
    [user, providers, loading, showLogin, login, logout, completeOAuthCallback],
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
