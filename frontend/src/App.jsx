import JSZip from 'jszip'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import ChatSidebar from './components/ai/ChatSidebar.jsx'
import MonacoWrapper, { DEFAULT_EDITOR_CONTENT, resolveLanguage } from './components/editor/MonacoWrapper.jsx'
import OutputTerminal from './components/editor/OutputTerminal.jsx'
import ThreeColumnLayout from './components/layout/ThreeColumnLayout.jsx'
import { RoomProvider } from './contexts/RoomContext.jsx'
import { useAuth } from './contexts/AuthContext.jsx'
import { useRoom } from './contexts/RoomContext.jsx'
import { useCRDT } from './hooks/useCRDT.js'
import { createRoom, deleteRoom, fetchRoom, fetchRooms, runCode } from './services/api.js'

const DEFAULT_FILE_ID = 'main'
const PENDING_WORKSPACE_KEY = 'code_collab_pending_workspace'
const PENDING_WORKSPACE_NAME_KEY = 'code_collab_pending_workspace_name'
const ROOT_ID = null

function GoogleMark() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

function GitHubMark() {
  return (
    <svg className="h-4 w-4 shrink-0 text-slate-100" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2.15c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.75 2.69 1.24 3.34.95.11-.74.4-1.24.73-1.53-2.56-.29-5.25-1.28-5.25-5.69 0-1.26.45-2.29 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.16 1.18a10.9 10.9 0 0 1 5.75 0c2.19-1.49 3.15-1.18 3.15-1.18.63 1.59.23 2.76.11 3.05.74.8 1.18 1.83 1.18 3.09 0 4.43-2.7 5.39-5.27 5.68.41.36.78 1.06.78 2.14v3.16c0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  )
}

function HealthBanner({ backendStatus }) {
  if (backendStatus?.status !== 'error') {
    return null
  }

  return (
    <div className="px-4 py-2 text-xs text-amber-400 bg-amber-400/10 border-b border-amber-400/20 text-center">
      Backend offline. Start the API server and refresh this page.
    </div>
  )
}

function Dashboard({ backendStatus }) {
  const navigate = useNavigate()
  const { providers, login, loading, authState, isAuthenticated, user } = useAuth()
  const [creating, setCreating] = useState(false)
  const [workspaceName, setWorkspaceName] = useState('My Workspace')
  const [rooms, setRooms] = useState([])
  const [roomsLoading, setRoomsLoading] = useState(false)
  const [error, setError] = useState('')
  const autoCreateAttemptedRef = useRef(false)
  const hasProviders = providers.google || providers.github

  const loadRooms = async () => {
    if (!isAuthenticated) {
      setRooms([])
      return
    }

    setRoomsLoading(true)
    try {
      const roomList = await fetchRooms()
      setRooms(roomList)
      roomList.forEach((room) => {
        localStorage.setItem(`code_collab_workspace_${room.room_id}`, room.name)
      })
    } catch {
      setRooms([])
    } finally {
      setRoomsLoading(false)
    }
  }

  const handleCreateRoom = async () => {
    if (authState === 'checking') {
      return
    }

    if (!isAuthenticated) {
      setError('Sign in or sign up first, then your workspace will open automatically.')
      localStorage.setItem(PENDING_WORKSPACE_KEY, '1')
      localStorage.setItem(PENDING_WORKSPACE_NAME_KEY, workspaceName.trim() || 'Untitled Workspace')
      return
    }

    setCreating(true)
    setError('')

    try {
      const pendingName = localStorage.getItem(PENDING_WORKSPACE_NAME_KEY)
      const room = await createRoom({ name: pendingName || workspaceName.trim() || 'Untitled Workspace' })
      localStorage.removeItem(PENDING_WORKSPACE_KEY)
      localStorage.removeItem(PENDING_WORKSPACE_NAME_KEY)
      localStorage.setItem(`code_collab_workspace_${room.room_id}`, room.name)
      navigate(`/${room.room_id}`)
    } catch (requestError) {
      const detail = requestError.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Could not create a workspace.')
      localStorage.removeItem(PENDING_WORKSPACE_KEY)
      localStorage.removeItem(PENDING_WORKSPACE_NAME_KEY)
    } finally {
      setCreating(false)
    }
  }

  const handleProviderLogin = (provider) => {
    localStorage.setItem(PENDING_WORKSPACE_KEY, '1')
    localStorage.setItem(PENDING_WORKSPACE_NAME_KEY, workspaceName.trim() || 'Untitled Workspace')
    login(provider, window.location.pathname)
  }

  const handleDeleteRoom = async (roomId, roomName) => {
    if (!window.confirm(`Delete "${roomName}" permanently?`)) {
      return
    }
    try {
      await deleteRoom(roomId)
      localStorage.removeItem(`code_collab_workspace_${roomId}`)
      setRooms((current) => current.filter((room) => room.room_id !== roomId))
    } catch (requestError) {
      const detail = requestError.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Could not delete this workspace.')
    }
  }

  useEffect(() => {
    loadRooms()
  }, [isAuthenticated])

  useEffect(() => {
    if (
      !isAuthenticated
      || authState !== 'authenticated'
      || creating
      || autoCreateAttemptedRef.current
      || localStorage.getItem(PENDING_WORKSPACE_KEY) !== '1'
    ) {
      return
    }

    autoCreateAttemptedRef.current = true
    handleCreateRoom()
  }, [isAuthenticated, authState, creating])

  return (
    <div className="h-full flex flex-col bg-[#0b0b0b]">
      <HealthBanner backendStatus={backendStatus} />
      <header className="h-14 px-5 flex items-center justify-between border-b border-slate-700/50 bg-slate-900/70">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-850 border border-slate-700/70 flex items-center justify-center text-accent font-mono font-bold shadow-glow-accent">
            &lt;/&gt;
          </div>
          <span className="text-sm font-semibold text-slate-200">Code Collab</span>
        </div>
        {isAuthenticated ? (
          <span className="text-sm text-slate-400">Signed in as {user?.name}</span>
        ) : (
          <div className="hidden sm:flex items-center gap-2">
            {providers.google && (
              <button type="button" onClick={() => handleProviderLogin('google')} className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-slate-850 text-slate-200 border border-slate-700/50 hover:border-accent/40 transition-all">
                <GoogleMark />
                Google
              </button>
            )}
            {providers.github && (
              <button type="button" onClick={() => handleProviderLogin('github')} className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-slate-850 text-slate-200 border border-slate-700/50 hover:border-accent/40 transition-all">
                <GitHubMark />
                GitHub
              </button>
            )}
          </div>
        )}
      </header>

      <main className={isAuthenticated ? 'flex-1 overflow-auto px-5 py-8' : 'flex-1 flex items-center justify-center px-6'}>
        <section className={isAuthenticated ? 'mx-auto w-full max-w-6xl text-left' : 'w-full max-w-md text-center'}>
          <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-850 border border-slate-700/60 text-3xl font-bold text-accent shadow-glow-lg">
            &lt;/&gt;
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-100">
            Code <span className="text-accent">Collab</span>
          </h1>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Real-time AI IDE Environment
          </p>

          {authState === 'checking' ? (
            <div className="mt-8 rounded-lg border border-slate-700/60 bg-slate-900 px-4 py-5 text-sm text-slate-400">
              Restoring your session...
            </div>
          ) : !isAuthenticated ? (
            <>
              <div className="mt-8 grid gap-3">
                {hasProviders ? (
                  <>
                    {providers.google && (
                      <button type="button" onClick={() => handleProviderLogin('google')} className="inline-flex items-center justify-center gap-3 rounded-lg border border-slate-700/60 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-100 hover:border-accent/40 hover:bg-slate-850 hover:shadow-glow transition-all">
                        <GoogleMark />
                        Sign in / Sign up with Google
                      </button>
                    )}
                    {providers.github && (
                      <button type="button" onClick={() => handleProviderLogin('github')} className="inline-flex items-center justify-center gap-3 rounded-lg border border-slate-700/60 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-100 hover:border-accent/40 hover:bg-slate-850 hover:shadow-glow transition-all">
                        <GitHubMark />
                        Sign in / Sign up with GitHub
                      </button>
                    )}
                  </>
                ) : (
                  <p className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
                    OAuth providers are not configured on the backend yet.
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={handleCreateRoom}
                disabled={loading || backendStatus?.status === 'error'}
                className="mt-5 w-full px-5 py-3 text-sm font-semibold rounded-lg bg-accent/15 text-accent border border-accent/30 shadow-glow hover:bg-accent/25 hover:shadow-glow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue to Workspace
              </button>
            </>
          ) : (
            <div className="mt-8 space-y-6 text-left">
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-700/50 bg-slate-900/70 p-4 shadow-glow">
                <div className="flex min-w-0 items-center gap-3">
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt={user.name} className="h-11 w-11 rounded-lg object-cover ring-1 ring-slate-700" />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent/15 text-sm font-semibold text-accent">
                    {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-100">{user?.name}</div>
                  <div className="truncate text-xs text-slate-500">{user?.email}</div>
                  <div className="mt-1 truncate text-[11px] uppercase tracking-wide text-slate-600">
                    {user?.provider} account
                    {user?.last_login_at ? ` · Last login ${new Date(user.last_login_at).toLocaleString()}` : ''}
                  </div>
                </div>
                </div>
                <span className="rounded-lg border border-slate-700/50 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-400">
                  {roomsLoading ? 'Loading...' : `${rooms.length} workspaces`}
                </span>
              </div>

              <div className="grid gap-5 lg:grid-cols-[20rem_1fr]">
              <div className="rounded-xl border border-slate-700/50 bg-slate-900/70 p-4 shadow-glow">
              <h2 className="text-sm font-semibold text-slate-100">Create workspace</h2>
              <label className="mt-4 block">
                <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  Workspace name
                </span>
                <input
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  className="w-full rounded-lg border border-slate-700/60 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-accent/40"
                  placeholder="My Workspace"
                />
              </label>

              <button
                type="button"
                onClick={handleCreateRoom}
                disabled={creating || loading || backendStatus?.status === 'error'}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 px-5 py-3 text-sm font-semibold rounded-lg bg-accent/15 text-accent border border-accent/30 shadow-glow hover:bg-accent/25 hover:shadow-glow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="text-lg leading-none">+</span>
                {creating ? 'Creating Workspace...' : 'New Workspace'}
              </button>
              </div>

              <div className="min-w-0">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-300">Recent workspaces</h2>
                  <span className="text-xs text-slate-500">
                    {roomsLoading ? 'Loading...' : `${rooms.length} saved`}
                  </span>
                </div>
                  {rooms.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-700/70 bg-slate-950/60 px-4 py-10 text-center text-sm text-slate-500">
                      No workspaces yet. Create one to start building.
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {rooms.map((room) => (
                      <div key={room.room_id} className="group rounded-xl border border-slate-800 bg-slate-900/80 p-4 transition-all hover:border-accent/30 hover:shadow-glow">
                        <button
                          type="button"
                          onClick={() => {
                            localStorage.setItem(`code_collab_workspace_${room.room_id}`, room.name)
                            navigate(`/${room.room_id}`)
                          }}
                          className="block w-full text-left"
                        >
                          <span className="mb-4 flex h-20 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-2xl font-bold text-accent">
                            &lt;/&gt;
                          </span>
                          <span className="block truncate text-sm font-semibold text-slate-100">{room.name}</span>
                          <span className="mt-1 block truncate text-xs text-slate-500">
                            {new Date(room.created_at).toLocaleString()}
                          </span>
                        </button>
                        <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3">
                          <button
                            type="button"
                            onClick={() => navigate(`/${room.room_id}`)}
                            className="text-xs font-semibold text-accent"
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRoom(room.room_id, room.name)}
                            className="text-xs font-semibold text-red-300 opacity-80 hover:opacity-100"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                    </div>
                  )}
              </div>
              </div>
            </div>
          )}

          {error && (
            <p className="mt-4 text-sm text-red-300 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </section>
      </main>
    </div>
  )
}

function getLanguageIdFromName(name) {
  const extension = name.split('.').pop()?.toLowerCase()
  const map = {
    py: 71,
    js: 93,
    jsx: 93,
    ts: 74,
    tsx: 74,
    cpp: 54,
    'c++': 54,
    cc: 54,
    cxx: 54,
    hpp: 54,
    c: 50,
    h: 50,
    java: 91,
    rs: 73,
    go: 60,
    rb: 72,
    cs: 51,
    php: 68,
    swift: 83,
    kt: 78,
    kts: 78,
    r: 80,
    dart: 90,
    scala: 81,
    sc: 81,
    sh: 46,
    bash: 46,
    sql: 82,
  }
  return map[extension] ?? 71
}

function getFileIcon(entry) {
  if (entry.type === 'folder') {
    return entry.expanded ? '▾' : '▸'
  }
  return resolveLanguage(entry.languageId).icon
}

function getChildEntries(fileTree, parentId) {
  return fileTree
    .filter((entry) => (entry.parentId ?? ROOT_ID) === parentId)
    .sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
}

function joinPath(parentPath, name) {
  return parentPath ? `${parentPath}/${name}` : name
}

function ExplorerPanel({
  fileTree,
  activeFileId,
  activeUsersByFile = {},
  awarenessClientId = null,
  importing = false,
  onSelectFile,
  onAddFile,
  onAddFolder,
  onDelete,
  onRename,
  onToggleFolder,
  onSelectFolder,
  onImport,
  onExport,
  selectedFolderId,
}) {
  const inputRef = useRef(null)
  const [renamingId, setRenamingId] = useState(null)
  const [draftName, setDraftName] = useState('')
  const selectedEntry = (selectedFolderId
    ? fileTree.find((entry) => entry.id === selectedFolderId)
    : null) || fileTree.find((entry) => entry.id === activeFileId)

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.setAttribute('webkitdirectory', '')
      inputRef.current.setAttribute('directory', '')
    }
  }, [])

  const startRename = (file) => {
    setRenamingId(file.id)
    setDraftName(file.name)
  }

  const submitRename = () => {
    if (renamingId && draftName.trim()) {
      onRename(renamingId, draftName.trim())
    }
    setRenamingId(null)
    setDraftName('')
  }

  const renderEntries = (parentId = ROOT_ID, depth = 0) =>
    getChildEntries(fileTree, parentId).map((entry) => {
      const active = entry.id === activeFileId
      const selectedFolder = entry.id === selectedFolderId
      const folder = entry.type === 'folder'
      const children = folder && entry.expanded ? renderEntries(entry.id, depth + 1) : null
      const editingUsers = (activeUsersByFile[entry.id] || []).filter(
        (editingUser) => editingUser.client_id !== awarenessClientId,
      )

      return (
        <li key={entry.id}>
          <div
            className={`group grid grid-cols-[1fr_auto] items-center gap-1 rounded-md ${
              active || selectedFolder ? 'bg-slate-850 text-accent' : 'text-slate-400 hover:bg-slate-850'
            }`}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
          >
            <button
              type="button"
              onClick={() => {
                if (folder) {
                  onSelectFolder(entry.id)
                  onToggleFolder(entry.id)
                } else {
                  onSelectFolder(entry.parentId ?? ROOT_ID)
                  onSelectFile(entry.id)
                }
              }}
              onDoubleClick={() => startRename(entry)}
              className="min-w-0 flex items-center gap-2 py-1.5 pr-1 text-left"
              title={entry.path}
            >
              <span className={`w-8 shrink-0 text-[10px] font-semibold ${folder ? 'text-slate-500' : 'text-accent'}`}>
                {getFileIcon(entry)}
              </span>
              {renamingId === entry.id ? (
                <input
                  value={draftName}
                  autoFocus
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => setDraftName(event.target.value)}
                  onBlur={submitRename}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') submitRename()
                    if (event.key === 'Escape') setRenamingId(null)
                  }}
                  className="min-w-0 flex-1 rounded bg-slate-950 px-2 py-1 text-xs text-slate-200 outline-none border border-accent/30"
                />
              ) : (
                <span className="truncate">{entry.name}</span>
              )}
            </button>
            <span className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600">
              {editingUsers.slice(0, 3).map((editingUser) => (
                <span
                  key={editingUser.client_id}
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold text-slate-950"
                  style={{ backgroundColor: editingUser.color || '#8ab4f8' }}
                  title={`${editingUser.name} is editing`}
                >
                  {editingUser.name?.charAt(0)?.toUpperCase() || '?'}
                </span>
              ))}
              {editingUsers.length > 3 ? `+${editingUsers.length - 3}` : active || selectedFolder ? 'selected' : ''}
            </span>
          </div>
          {children && <ul className="space-y-1">{children}</ul>}
        </li>
      )
    })

  return (
    <div className="panel flex flex-col flex-1 min-h-0">
      <div className="panel-header flex items-center justify-between">
        <span>Explorer</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onAddFile} className="text-xs text-slate-500 hover:text-accent transition-colors">+ File</button>
          <button type="button" onClick={onAddFolder} className="text-xs text-slate-500 hover:text-accent transition-colors">+ Folder</button>
        </div>
      </div>
      <div className="flex gap-2 px-3 py-2 border-b border-slate-700/50">
        <button
          type="button"
          disabled={importing}
          onClick={() => inputRef.current?.click()}
          className="flex-1 px-2 py-1.5 text-xs rounded-lg bg-slate-850 text-slate-400 border border-slate-700/50 hover:text-accent hover:border-accent/30 transition-all disabled:cursor-not-allowed disabled:opacity-50"
        >
          {importing ? 'Importing…' : 'Import'}
        </button>
        <button
          type="button"
          disabled={importing}
          onClick={onExport}
          className="flex-1 px-2 py-1.5 text-xs rounded-lg bg-slate-850 text-slate-400 border border-slate-700/50 hover:text-accent hover:border-accent/30 transition-all disabled:cursor-not-allowed disabled:opacity-50"
        >
          Download
        </button>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={onImport} disabled={importing} />
      </div>
      {selectedEntry && (
        <div className="px-3 py-2 border-b border-slate-700/50 bg-slate-950/40">
          <div className="mb-2 truncate text-xs text-slate-500">{selectedEntry.path}</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => startRename(selectedEntry)}
              className="px-2 py-1.5 text-xs rounded-lg bg-slate-850 text-slate-300 border border-slate-700/50 hover:text-accent hover:border-accent/30 transition-all"
            >
              Rename
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete "${selectedEntry.name}"? This cannot be undone.`)) {
                  onDelete(selectedEntry.id)
                }
              }}
              className="px-2 py-1.5 text-xs rounded-lg bg-red-400/10 text-red-300 border border-red-400/20 hover:bg-red-400/20 transition-all"
            >
              Delete
            </button>
          </div>
        </div>
      )}
      <div className="flex-1 p-3 overflow-auto" onClick={() => onSelectFolder(ROOT_ID)}>
        {fileTree.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-slate-500">No files yet. Add a file or folder to get started.</p>
        ) : (
          <ul className="space-y-1 text-sm" onClick={(event) => event.stopPropagation()}>
            {renderEntries()}
          </ul>
        )}
      </div>
    </div>
  )
}

function EmptyWorkspacePanel({ onAddFile, onAddFolder }) {
  return (
    <div className="panel flex flex-1 min-h-0 flex-col items-center justify-center gap-4 p-8 text-center shadow-glow">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-slate-700/60 bg-slate-850 text-xl font-bold text-accent">
        &lt;/&gt;
      </div>
      <div>
        <h2 className="text-base font-semibold text-slate-100">No files in this workspace</h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
          Create a file or import a folder to start editing.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={onAddFile} className="rounded-lg border border-accent/30 bg-accent/15 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/25">
          + File
        </button>
        <button type="button" onClick={onAddFolder} className="rounded-lg border border-slate-700/60 bg-slate-850 px-4 py-2 text-sm font-semibold text-slate-300 hover:border-accent/30">
          + Folder
        </button>
      </div>
    </div>
  )
}

function EditorPanel({ getCodeRef, setFileContentRef, getAllFilesContentRef, activeFile, onLanguageChange, crdt }) {
  const { isAuthenticated, setShowLogin } = useAuth()
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const selectedLanguage = resolveLanguage(activeFile?.languageId ?? 71)

  if (!activeFile) {
    return null
  }

  const handleRun = async (stdin) => {
    if (!isAuthenticated) {
      setShowLogin(true)
      return
    }

    setRunning(true)
    setResult(null)

    try {
      const executionResult = await runCode({
        sourceCode: getCodeRef.current(activeFile.id),
        languageId: activeFile.languageId,
        language: selectedLanguage.monaco,
        stdin: stdin || null,
      })
      setResult(executionResult)
    } catch (error) {
      const detail = error.response?.data?.detail
      setResult({
        stdout: null,
        stderr: typeof detail === 'string' ? detail : 'Failed to execute code.',
        status: 'Error',
        time_ms: null,
        memory_kb: null,
        exit_code: null,
      })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      <MonacoWrapper
        filename={activeFile.name}
        languageId={activeFile.languageId}
        onLanguageChange={onLanguageChange}
        activeFileId={activeFile.id}
        crdt={crdt}
        getCodeRef={getCodeRef}
        setFileContentRef={setFileContentRef}
        getAllFilesContentRef={getAllFilesContentRef}
        executionResult={result}
      />
      <OutputTerminal onRun={handleRun} running={running} result={result} />
    </div>
  )
}

function Workspace({ getCodeRef, setFileContentRef, getAllFilesContentRef, workspaceName }) {
  const { send, connected, addMessageListener } = useRoom()
  const { user } = useAuth()
  const initialFileTree = useMemo(
    () => [
      {
        id: DEFAULT_FILE_ID,
        name: 'main.py',
        path: 'main.py',
        parentId: ROOT_ID,
        languageId: 71,
        type: 'file',
        content: DEFAULT_EDITOR_CONTENT,
      },
    ],
    [],
  )
  const [activeFileId, setActiveFileId] = useState(DEFAULT_FILE_ID)
  const [selectedFolderId, setSelectedFolderId] = useState(ROOT_ID)
  const [importing, setImporting] = useState(false)
  const crdt = useCRDT({
    send,
    addMessageListener,
    connected,
    initialFileTree,
    activeFileId,
    initialWorkspaceName: workspaceName,
    user,
  })
  const { fileTree } = crdt
  const activeFile = fileTree.find((file) => file.id === activeFileId) ?? fileTree.find((file) => file.type !== 'folder')
  const selectedLanguage = resolveLanguage(activeFile?.languageId ?? 71)

  useEffect(() => {
    if (fileTree.length === 0) {
      if (activeFileId) {
        setActiveFileId('')
      }
      return
    }
    if (activeFileId && fileTree.some((entry) => entry.id === activeFileId)) {
      return
    }
    setActiveFileId(fileTree.find((entry) => entry.type !== 'folder')?.id ?? '')
  }, [activeFileId, fileTree])

  useEffect(() => {
    if (selectedFolderId && !fileTree.some((entry) => entry.id === selectedFolderId)) {
      setSelectedFolderId(ROOT_ID)
    }
  }, [fileTree, selectedFolderId])

  const getFolderPath = (folderId) => {
    if (!folderId) {
      return ''
    }
    return fileTree.find((entry) => entry.id === folderId)?.path ?? ''
  }

  const uniqueChildName = (parentId, baseName) => {
    const existing = new Set(getChildEntries(fileTree, parentId).map((entry) => entry.name))
    if (!existing.has(baseName)) {
      return baseName
    }

    const dot = baseName.lastIndexOf('.')
    const stem = dot > 0 ? baseName.slice(0, dot) : baseName
    const ext = dot > 0 ? baseName.slice(dot) : ''
    let index = 2
    while (existing.has(`${stem}-${index}${ext}`)) {
      index += 1
    }
    return `${stem}-${index}${ext}`
  }

  const updateDescendantPaths = (entries, folderId, oldPath, newPath) =>
    entries.map((entry) => {
      if (entry.id === folderId) {
        return { ...entry, path: newPath }
      }
      if (entry.path.startsWith(`${oldPath}/`)) {
        return { ...entry, path: `${newPath}${entry.path.slice(oldPath.length)}` }
      }
      return entry
    })

  const addFile = () => {
    const id = crypto.randomUUID()
    const parentPath = getFolderPath(selectedFolderId)
    const name = uniqueChildName(selectedFolderId, 'untitled.py')
    crdt.upsertFileEntry({
      id,
      name,
      path: joinPath(parentPath, name),
      parentId: selectedFolderId,
      languageId: getLanguageIdFromName(name),
      type: 'file',
    })
    setActiveFileId(id)
  }

  const addFolder = () => {
    const parentPath = getFolderPath(selectedFolderId)
    const name = uniqueChildName(selectedFolderId, 'folder')
    const id = crypto.randomUUID()
    crdt.upsertFileEntry({
      id,
      name,
      path: joinPath(parentPath, name),
      parentId: selectedFolderId,
      type: 'folder',
      expanded: true,
    })
    setSelectedFolderId(id)
  }

  const renameItem = (id, name) => {
    const current = fileTree.find((entry) => entry.id === id)
    if (!current) {
      return
    }
    const parentPath = fileTree.find((entry) => entry.id === current.parentId)?.path ?? ''
    const newPath = joinPath(parentPath, name)
    const renamed = fileTree.map((file) =>
      file.id === id
        ? {
            ...file,
            name,
            path: newPath,
            languageId: file.type === 'file' ? getLanguageIdFromName(name) : file.languageId,
          }
        : file,
    )
    const next = current.type === 'folder'
      ? updateDescendantPaths(renamed, id, current.path, newPath)
      : renamed
    crdt.batchUpdateEntries(next)
  }

  const updateLanguage = (languageId) => {
    if (!activeFile) {
      return
    }
    crdt.updateFileEntry(activeFile.id, { languageId })
  }

  const toggleFolder = (id) => {
    const entry = fileTree.find((item) => item.id === id)
    if (entry) {
      crdt.updateFileEntry(id, { expanded: !entry.expanded })
    }
  }

  const deleteItem = (id) => {
    const ids = crdt.deleteEntry(id)
    if (selectedFolderId && ids.has(selectedFolderId)) {
      setSelectedFolderId(ROOT_ID)
    }
  }

  const importProject = async (event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''

    if (!files.length) {
      return
    }

    const textFiles = files.filter(
      (file) =>
        file.type.startsWith('text/')
        || /\.(js|jsx|ts|tsx|py|java|cpp|c\+\+|cc|cxx|hpp|c|h|rs|go|rb|cs|php|swift|kt|kts|r|dart|scala|sc|sh|bash|sql|md|json|css|html)$/i.test(
          file.name,
        ),
    )

    if (!textFiles.length) {
      return
    }

    setImporting(true)

    try {
      const folderEntries = []
      const fileEntries = []
      const contentsById = {}
      const folderByPath = new Map(
        fileTree.filter((entry) => entry.type === 'folder').map((entry) => [entry.path, entry.id]),
      )
      const parentPath = getFolderPath(selectedFolderId)
      const parentId = selectedFolderId
      const existingPaths = new Set(fileTree.map((entry) => entry.path))

      for (let index = 0; index < textFiles.length; index += 1) {
        const file = textFiles[index]
        const rawPath = file.webkitRelativePath || file.name
        const parts = rawPath.split('/').filter(Boolean)
        const fileName = parts.pop()
        let currentParentId = parentId
        let currentPath = parentPath

        for (const part of parts) {
          currentPath = joinPath(currentPath, part)
          if (!folderByPath.has(currentPath)) {
            const folder = {
              id: crypto.randomUUID(),
              name: part,
              path: currentPath,
              parentId: currentParentId,
              type: 'folder',
              expanded: true,
            }
            folderByPath.set(currentPath, folder.id)
            folderEntries.push(folder)
            existingPaths.add(currentPath)
          }
          currentParentId = folderByPath.get(currentPath)
        }

        let path = joinPath(currentPath, fileName)
        let name = fileName
        if (existingPaths.has(path)) {
          name = uniqueChildName(currentParentId, fileName)
          path = joinPath(currentPath, name)
        }
        existingPaths.add(path)

        const id = crypto.randomUUID()
        contentsById[id] = await file.text()
        fileEntries.push({
          id,
          name,
          path,
          parentId: currentParentId,
          languageId: getLanguageIdFromName(name),
          type: 'file',
        })

        if (index % 15 === 14) {
          await new Promise((resolve) => window.setTimeout(resolve, 0))
        }
      }

      const entries = [...folderEntries, ...fileEntries]
      await crdt.importEntriesInBatches(entries, contentsById)

      const firstImportedFile = fileEntries[0]
      if (firstImportedFile) {
        setActiveFileId(firstImportedFile.id)
      }
    } finally {
      setImporting(false)
    }
  }

  const exportWorkspace = async () => {
    const zip = new JSZip()
    const contents = getAllFilesContentRef.current()
    fileTree.forEach((file) => {
      if (file.type !== 'folder') {
        zip.file(file.path, contents[file.id] ?? '')
      }
    })
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'code-collab-workspace.zip'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <ThreeColumnLayout
      workspaceName={crdt.workspaceName}
      leftPanel={
        <ExplorerPanel
          fileTree={fileTree}
          activeFileId={activeFileId}
          activeUsersByFile={crdt.activeUsersByFile}
          awarenessClientId={crdt.awarenessClientId}
          importing={importing}
          onSelectFile={setActiveFileId}
          onAddFile={addFile}
          onAddFolder={addFolder}
          onDelete={deleteItem}
          onRename={renameItem}
          onToggleFolder={toggleFolder}
          onSelectFolder={setSelectedFolderId}
          onImport={importProject}
          onExport={exportWorkspace}
          selectedFolderId={selectedFolderId}
        />
      }
      centerPanel={
        activeFile ? (
          <EditorPanel
            getCodeRef={getCodeRef}
            setFileContentRef={setFileContentRef}
            getAllFilesContentRef={getAllFilesContentRef}
            activeFile={activeFile}
            onLanguageChange={updateLanguage}
            crdt={crdt}
          />
        ) : (
          <EmptyWorkspacePanel onAddFile={addFile} onAddFolder={addFolder} />
        )
      }
      rightPanel={
        <ChatSidebar
          getCodeRef={getCodeRef}
          language={selectedLanguage.monaco}
          fileName={activeFile?.name || 'No file selected'}
        />
      }
    />
  )
}

function WorkspaceRoute({ backendStatus }) {
  const { roomId } = useParams()
  const { isAuthenticated } = useAuth()
  const getCodeRef = useRef(() => '')
  const setFileContentRef = useRef(() => {})
  const getAllFilesContentRef = useRef(() => ({}))
  const [workspaceName, setWorkspaceName] = useState(
    () => localStorage.getItem(`code_collab_workspace_${roomId}`) || 'Untitled Workspace',
  )

  useEffect(() => {
    if (!roomId) {
      return
    }
    if (!isAuthenticated) {
      sessionStorage.setItem('code_collab_auth_next', `/${roomId}`)
    }
  }, [roomId, isAuthenticated])

  useEffect(() => {
    if (!roomId) {
      return
    }
    fetchRoom(roomId)
      .then((room) => {
        setWorkspaceName(room.name)
        localStorage.setItem(`code_collab_workspace_${roomId}`, room.name)
      })
      .catch(() => {
        setWorkspaceName(localStorage.getItem(`code_collab_workspace_${roomId}`) || 'Untitled Workspace')
      })
  }, [roomId])

  if (!roomId) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="h-full flex flex-col">
      <HealthBanner backendStatus={backendStatus} />
      <RoomProvider roomId={roomId}>
        <Workspace
          getCodeRef={getCodeRef}
          setFileContentRef={setFileContentRef}
          getAllFilesContentRef={getAllFilesContentRef}
          workspaceName={workspaceName}
        />
      </RoomProvider>
    </div>
  )
}

export default function App() {
  const [backendStatus, setBackendStatus] = useState(null)

  useEffect(() => {
    fetch('/health')
      .then((res) => res.json())
      .then(setBackendStatus)
      .catch(() => setBackendStatus({ status: 'error' }))
  }, [])

  return (
    <Routes>
      <Route path="/" element={<Dashboard backendStatus={backendStatus} />} />
      <Route path="/:roomId" element={<WorkspaceRoute backendStatus={backendStatus} />} />
    </Routes>
  )
}
