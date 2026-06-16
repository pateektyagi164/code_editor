import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { useRoom } from '../../contexts/RoomContext.jsx'
import ActiveUserAvatars from '../editor/ActiveUserAvatars.jsx'
import LatencyTracker from './LatencyTracker.jsx'

function LoginModal() {
  const { providers, login, setShowLogin } = useAuth()

  const hasProviders = providers.google || providers.github

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="panel w-full max-w-sm mx-4 shadow-glow-lg">
        <div className="panel-header flex items-center justify-between">
          <span>Sign in to Code Collab</span>
          <button
            type="button"
            onClick={() => setShowLogin(false)}
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-3">
          {!hasProviders ? (
            <p className="text-sm text-slate-400 leading-relaxed">
              OAuth is not configured yet. Add{' '}
              <code className="text-accent font-mono text-xs">GOOGLE_CLIENT_ID</code> or{' '}
              <code className="text-accent font-mono text-xs">GITHUB_CLIENT_ID</code> to your
              backend <code className="text-accent font-mono text-xs">.env</code> file.
            </p>
          ) : (
            <>
              {providers.google && (
                <button
                  type="button"
                  onClick={() => login('google')}
                  className="w-full flex items-center justify-center gap-3 px-4 py-2.5 text-sm font-medium rounded-lg bg-slate-850 border border-slate-700/50 text-slate-200 hover:bg-slate-800 hover:border-slate-600 transition-all"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Continue with Google
                </button>
              )}

              {providers.github && (
                <button
                  type="button"
                  onClick={() => login('github')}
                  className="w-full flex items-center justify-center gap-3 px-4 py-2.5 text-sm font-medium rounded-lg bg-slate-850 border border-slate-700/50 text-slate-200 hover:bg-slate-800 hover:border-slate-600 transition-all"
                >
                  <span className="text-base">🐙</span>
                  Continue with GitHub
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Navbar({ workspaceName = 'Untitled Workspace' }) {
  const { user, loading, isAuthenticated, setShowLogin, logout, showLogin } = useAuth()
  const { latencyMs, connected, activeUsers } = useRoom()
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    await navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <>
      <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-2 border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-sm shrink-0">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/10 shadow-glow-accent">
            <svg
              className="w-4 h-4 text-accent"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
              />
            </svg>
          </div>
          <h1 className="shrink-0 text-base font-semibold text-slate-200 tracking-tight">
            Code Collab
          </h1>
          <span className="hidden sm:inline-flex max-w-64 truncate items-center px-2 py-0.5 text-xs font-medium rounded-md bg-slate-800 text-slate-400 border border-slate-700/50">
            {workspaceName}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-4">
          <button
            type="button"
            onClick={handleShare}
            className="hidden sm:inline-flex px-3 py-1.5 text-sm font-medium rounded-lg bg-slate-850 text-slate-300 border border-slate-700/50 hover:text-slate-100 hover:border-accent/30 hover:shadow-glow transition-all"
          >
            {copied ? 'Link Copied!' : 'Share Workspace'}
          </button>
          <ActiveUserAvatars users={activeUsers} connected={connected && isAuthenticated} />
          <LatencyTracker latencyMs={latencyMs} connected={connected && isAuthenticated} />

          {loading ? (
            <span className="text-xs text-slate-500">Loading…</span>
          ) : isAuthenticated ? (
            <>
              <div className="flex min-w-0 items-center gap-2">
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.name}
                    className="w-7 h-7 rounded-lg object-cover ring-1 ring-slate-700"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-lg bg-accent/20 flex items-center justify-center text-xs font-medium text-accent">
                    {user.name?.charAt(0)?.toUpperCase()}
                  </div>
                )}
                <span className="hidden max-w-36 truncate sm:inline text-sm text-slate-300">{user.name}</span>
              </div>
              <button
                type="button"
                onClick={logout}
                className="px-3 py-1.5 text-sm font-medium rounded-lg text-slate-400 border border-slate-700/50 hover:text-slate-200 hover:bg-slate-850 transition-all"
              >
                Sign Out
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowLogin(true)}
              className="px-4 py-1.5 text-sm font-medium rounded-lg bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 hover:shadow-glow transition-all duration-200"
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      {showLogin && <LoginModal />}
    </>
  )
}
