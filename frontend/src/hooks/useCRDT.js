import { useCallback, useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { MonacoBinding } from 'y-monaco'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness'

const MSG_UPDATE = 0x00
const MSG_SYNC_REQUEST = 0x01
const MSG_SYNC_RESPONSE = 0x02
const MSG_AWARENESS = 0x06
const MSG_SNAPSHOT = 0x07
const SNAPSHOT_INTERVAL_MS = 45000
const SEED_FALLBACK_MS = 3000
const IMPORT_BATCH_SIZE = 25
const ROOT_ID = null

function ensureYText(fileContentsMap, fileId) {
  let ytext = fileContentsMap.get(fileId)
  if (!ytext) {
    ytext = new Y.Text()
    fileContentsMap.set(fileId, ytext)
  }
  return ytext
}

function cloneEntry(entry) {
  return entry ? { ...entry } : entry
}

function serializeTree(fileTreeMap) {
  return Array.from(fileTreeMap.values())
    .map(cloneEntry)
    .sort((a, b) => {
      const leftPath = a.path || a.name || ''
      const rightPath = b.path || b.name || ''
      if (a.type !== b.type && (a.parentId ?? ROOT_ID) === (b.parentId ?? ROOT_ID)) {
        return a.type === 'folder' ? -1 : 1
      }
      return leftPath.localeCompare(rightPath)
    })
}

function collectDescendantIdsFromMap(fileTreeMap, rootId) {
  const collected = new Set([rootId])
  let changed = true
  while (changed) {
    changed = false
    fileTreeMap.forEach((entry, id) => {
      const parentId = entry?.parentId ?? ROOT_ID
      if (parentId !== ROOT_ID && collected.has(parentId) && !collected.has(id)) {
        collected.add(id)
        changed = true
      }
    })
  }
  return collected
}

function applyPersistedUpdates(ydoc, payload) {
  let offset = 0
  while (offset + 4 <= payload.length) {
    const length = new DataView(payload.buffer, payload.byteOffset + offset, 4).getUint32(0)
    offset += 4
    if (length <= 0 || offset + length > payload.length) {
      return false
    }
    Y.applyUpdate(ydoc, payload.slice(offset, offset + length), 'remote')
    offset += length
  }
  return offset === payload.length && payload.length > 0
}

function sendSnapshot(send, ydoc) {
  const state = Y.encodeStateAsUpdate(ydoc)
  const payload = new Uint8Array(state.length + 1)
  payload[0] = MSG_SNAPSHOT
  payload.set(state, 1)
  send(payload)
}

function applyTreeEntries(fileTreeMap, fileContentsMap, entries, contentsById = {}) {
  entries.forEach((entry) => {
    fileTreeMap.set(entry.id, cloneEntry(entry))
    if (entry.type !== 'folder') {
      const ytext = ensureYText(fileContentsMap, entry.id)
      const content = contentsById[entry.id]
      if (content && ytext.length === 0) {
        ytext.insert(0, content)
      }
    }
  })
}

export function useCRDT({
  send,
  addMessageListener,
  connected,
  initialFileTree = [],
  activeFileId = 'main',
  initialWorkspaceName = 'Untitled Workspace',
  user = null,
}) {
  const [fileTree, setFileTree] = useState([])
  const [workspaceName, setWorkspaceNameState] = useState(initialWorkspaceName)
  const [activeUsersByFile, setActiveUsersByFile] = useState({})
  const [awarenessClientId, setAwarenessClientId] = useState(null)
  const [remoteUpdateVersion, setRemoteUpdateVersion] = useState(0)
  const ydocRef = useRef(null)
  const fileContentsMapRef = useRef(null)
  const fileTreeMapRef = useRef(null)
  const metaMapRef = useRef(null)
  const awarenessRef = useRef(null)
  const bindingRef = useRef(null)
  const editorRef = useRef(null)
  const modelRef = useRef(null)
  const seedStateRef = useRef({ seeded: false, syncReceived: false })
  const initialFileTreeRef = useRef(initialFileTree)
  const initialWorkspaceNameRef = useRef(initialWorkspaceName)
  const pendingLocalUpdateRef = useRef(null)
  const flushTimerRef = useRef(null)
  const sendRef = useRef(send)

  sendRef.current = send
  initialFileTreeRef.current = initialFileTree
  initialWorkspaceNameRef.current = initialWorkspaceName

  useEffect(() => {
    const ydoc = new Y.Doc()
    const awareness = new Awareness(ydoc)
    const fileContentsMap = ydoc.getMap('workspace_files')
    const fileTreeMap = ydoc.getMap('workspace_file_tree')
    const metaMap = ydoc.getMap('workspace_meta')

    ydocRef.current = ydoc
    awarenessRef.current = awareness
    fileContentsMapRef.current = fileContentsMap
    fileTreeMapRef.current = fileTreeMap
    metaMapRef.current = metaMap
    setAwarenessClientId(awareness.clientID)

    const refreshTree = () => {
      setFileTree(serializeTree(fileTreeMap))
    }
    const refreshMeta = () => {
      setWorkspaceNameState(metaMap.get('name') || initialWorkspaceNameRef.current)
    }

    const flushPendingUpdate = () => {
      flushTimerRef.current = null
      const merged = pendingLocalUpdateRef.current
      pendingLocalUpdateRef.current = null
      if (!merged) {
        return
      }
      const payload = new Uint8Array(merged.length + 1)
      payload[0] = MSG_UPDATE
      payload.set(merged, 1)
      sendRef.current(payload)
    }

    const queueLocalUpdate = (update) => {
      pendingLocalUpdateRef.current = pendingLocalUpdateRef.current
        ? Y.mergeUpdates([pendingLocalUpdateRef.current, update])
        : update
      if (flushTimerRef.current === null) {
        flushTimerRef.current = window.setTimeout(flushPendingUpdate, 16)
      }
    }

    const maybeSeedWorkspace = () => {
      if (seedStateRef.current.seeded) {
        return
      }
      if (metaMap.get('initialized') || fileTreeMap.size > 0) {
        seedStateRef.current.seeded = true
        return
      }

      seedStateRef.current.seeded = true
      ydoc.transact(() => {
        metaMap.set('initialized', true)
        metaMap.set('name', metaMap.get('name') || initialWorkspaceNameRef.current)
        initialFileTreeRef.current.forEach(({ content, ...entry }) => {
          fileTreeMap.set(entry.id, cloneEntry(entry))
          if (entry.type !== 'folder') {
            const ytext = ensureYText(fileContentsMap, entry.id)
            if (content && ytext.length === 0) {
              ytext.insert(0, content)
            }
          }
        })
      })
    }

    const refreshAwarenessFiles = () => {
      const next = {}
      awareness.getStates().forEach((state, clientId) => {
        const activeFile = state?.user?.active_file_id
        if (!activeFile) {
          return
        }
        next[activeFile] = [
          ...(next[activeFile] || []),
          {
            client_id: clientId,
            name: state.user.name,
            color: state.user.color,
            avatar_url: state.user.avatar_url || null,
          },
        ]
      })
      setActiveUsersByFile(next)
    }

    const handleDocUpdate = (update, origin) => {
      refreshTree()
      refreshMeta()
      if (origin === 'remote') {
        setRemoteUpdateVersion((version) => version + 1)
        return
      }
      queueLocalUpdate(update)
    }

    const handleAwarenessUpdate = ({ added, updated, removed }, origin) => {
      if (origin === 'remote') {
        return
      }
      const changedClients = added.concat(updated, removed)
      const update = encodeAwarenessUpdate(awareness, changedClients)
      const payload = new Uint8Array(update.length + 1)
      payload[0] = MSG_AWARENESS
      payload.set(update, 1)
      sendRef.current(payload)
    }

    ydoc.on('update', handleDocUpdate)
    awareness.on('update', handleAwarenessUpdate)
    awareness.on('change', refreshAwarenessFiles)
    fileTreeMap.observe(refreshTree)
    metaMap.observe(refreshMeta)

    const removeListener = addMessageListener((data) => {
      if (!data.length) {
        return
      }

      const type = data[0]
      const payload = data.slice(1)

      if (type === MSG_UPDATE) {
        Y.applyUpdate(ydoc, payload, 'remote')
      } else if (type === MSG_SYNC_RESPONSE) {
        seedStateRef.current.syncReceived = true
        if (!applyPersistedUpdates(ydoc, payload)) {
          Y.applyUpdate(ydoc, payload, 'remote')
        }
        maybeSeedWorkspace()
      } else if (type === MSG_AWARENESS) {
        applyAwarenessUpdate(awareness, payload, 'remote')
      } else if (type === MSG_SYNC_REQUEST) {
        const state = Y.encodeStateAsUpdate(ydoc)
        const response = new Uint8Array(state.length + 1)
        response[0] = MSG_SYNC_RESPONSE
        response.set(state, 1)
        sendRef.current(response)
      }
    })

    refreshTree()
    refreshMeta()

    const seedFallbackTimer = window.setTimeout(() => {
      if (!seedStateRef.current.syncReceived) {
        maybeSeedWorkspace()
      }
      refreshTree()
      refreshMeta()
    }, SEED_FALLBACK_MS)

    return () => {
      window.clearTimeout(seedFallbackTimer)
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
      flushPendingUpdate()
      sendSnapshot(sendRef.current, ydoc)
      removeListener()
      ydoc.off('update', handleDocUpdate)
      awareness.off('update', handleAwarenessUpdate)
      awareness.off('change', refreshAwarenessFiles)
      fileTreeMap.unobserve(refreshTree)
      metaMap.unobserve(refreshMeta)
      bindingRef.current?.destroy()
      bindingRef.current = null
      ydoc.destroy()
      awareness.destroy()
      ydocRef.current = null
      fileContentsMapRef.current = null
      fileTreeMapRef.current = null
      metaMapRef.current = null
      awarenessRef.current = null
      pendingLocalUpdateRef.current = null
      seedStateRef.current = { seeded: false, syncReceived: false }
      setAwarenessClientId(null)
      setRemoteUpdateVersion(0)
    }
  }, [addMessageListener])

  useEffect(() => {
    const metaMap = metaMapRef.current
    if (metaMap && !metaMap.get('name')) {
      metaMap.set('name', initialWorkspaceName)
    }
  }, [initialWorkspaceName])

  useEffect(() => {
    const awareness = awarenessRef.current
    if (!awareness || !user) {
      return
    }

    const name = user.name || 'Collaborator'
    const colors = ['#8ab4f8', '#81c995', '#fdd663', '#f28b82', '#c58af9']
    const color = colors[Math.abs(name.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)) % colors.length]

    awareness.setLocalStateField('user', {
      name,
      color,
      colorLight: `${color}33`,
      avatar_url: user.avatar_url || null,
      active_file_id: activeFileId || null,
    })
  }, [user, activeFileId, connected])

  useEffect(() => {
    if (!connected) {
      return
    }
    send(new Uint8Array([MSG_SYNC_REQUEST]))
  }, [connected, send])

  useEffect(() => {
    const ydoc = ydocRef.current
    if (!connected || !ydoc) {
      return undefined
    }

    const interval = window.setInterval(() => {
      sendSnapshot(send, ydoc)
    }, SNAPSHOT_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [connected, send])

  const rebindEditor = useCallback(() => {
    const fileContentsMap = fileContentsMapRef.current
    const editor = editorRef.current
    const model = modelRef.current
    const awareness = awarenessRef.current
    if (!fileContentsMap || !editor || !model || !activeFileId) {
      return
    }

    const ytext = ensureYText(fileContentsMap, activeFileId)
    bindingRef.current?.destroy()
    bindingRef.current = new MonacoBinding(ytext, model, new Set([editor]), awareness)
  }, [activeFileId])

  const bindEditor = useCallback(
    (editor, model) => {
      editorRef.current = editor
      modelRef.current = model
      rebindEditor()
    },
    [rebindEditor],
  )

  const getContent = useCallback((fileId) => {
    const fileContentsMap = fileContentsMapRef.current
    if (!fileContentsMap || !fileId) {
      return ''
    }
    return ensureYText(fileContentsMap, fileId).toString()
  }, [])

  const setFileContent = useCallback((fileId, content) => {
    const fileContentsMap = fileContentsMapRef.current
    if (!fileContentsMap || !fileId) {
      return
    }

    const ytext = ensureYText(fileContentsMap, fileId)
    ydocRef.current?.transact(() => {
      ytext.delete(0, ytext.length)
      if (content) {
        ytext.insert(0, content)
      }
    })
  }, [])

  const getAllFilesContent = useCallback(() => {
    const fileContentsMap = fileContentsMapRef.current
    const contents = {}
    if (!fileContentsMap) {
      return contents
    }

    fileTree.forEach((file) => {
      if (file.type !== 'folder') {
        contents[file.id] = ensureYText(fileContentsMap, file.id).toString()
      }
    })
    return contents
  }, [fileTree])

  const setWorkspaceName = useCallback((name) => {
    const metaMap = metaMapRef.current
    if (!metaMap) {
      return
    }
    metaMap.set('name', name.trim() || 'Untitled Workspace')
  }, [])

  const upsertFileEntry = useCallback((entry, content = '') => {
    const fileTreeMap = fileTreeMapRef.current
    const fileContentsMap = fileContentsMapRef.current
    if (!fileTreeMap || !fileContentsMap) {
      return
    }
    ydocRef.current?.transact(() => {
      applyTreeEntries(fileTreeMap, fileContentsMap, [entry], { [entry.id]: content })
    })
  }, [])

  const batchUpsertEntries = useCallback((entries, contentsById = {}) => {
    const fileTreeMap = fileTreeMapRef.current
    const fileContentsMap = fileContentsMapRef.current
    if (!fileTreeMap || !fileContentsMap || !entries.length) {
      return
    }
    ydocRef.current?.transact(() => {
      applyTreeEntries(fileTreeMap, fileContentsMap, entries, contentsById)
    })
  }, [])

  const importEntriesInBatches = useCallback(async (entries, contentsById = {}) => {
    const ydoc = ydocRef.current
    if (!ydoc || !entries.length) {
      return
    }

    for (let offset = 0; offset < entries.length; offset += IMPORT_BATCH_SIZE) {
      const batch = entries.slice(offset, offset + IMPORT_BATCH_SIZE)
      const batchContents = Object.fromEntries(
        batch
          .filter((entry) => entry.type !== 'folder')
          .map((entry) => [entry.id, contentsById[entry.id] ?? '']),
      )
      ydoc.transact(() => {
        applyTreeEntries(fileTreeMapRef.current, fileContentsMapRef.current, batch, batchContents)
      })
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    }

    sendSnapshot(sendRef.current, ydoc)
  }, [])

  const batchUpdateEntries = useCallback((entries) => {
    const fileTreeMap = fileTreeMapRef.current
    if (!fileTreeMap || !entries.length) {
      return
    }
    ydocRef.current?.transact(() => {
      entries.forEach((entry) => {
        fileTreeMap.set(entry.id, cloneEntry(entry))
      })
    })
  }, [])

  const updateFileEntry = useCallback((id, patch) => {
    const fileTreeMap = fileTreeMapRef.current
    const current = fileTreeMap?.get(id)
    if (!fileTreeMap || !current) {
      return
    }
    ydocRef.current?.transact(() => {
      fileTreeMap.set(id, { ...cloneEntry(current), ...patch })
    })
  }, [])

  const deleteEntry = useCallback((rootId) => {
    const fileTreeMap = fileTreeMapRef.current
    const fileContentsMap = fileContentsMapRef.current
    if (!fileTreeMap || !fileContentsMap || !rootId) {
      return new Set()
    }

    const ids = collectDescendantIdsFromMap(fileTreeMap, rootId)
    ydocRef.current?.transact(() => {
      ids.forEach((id) => {
        fileTreeMap.delete(id)
        fileContentsMap.delete(id)
      })
    })
    return ids
  }, [])

  const deleteFileEntries = useCallback((ids) => {
    const fileTreeMap = fileTreeMapRef.current
    const fileContentsMap = fileContentsMapRef.current
    if (!fileTreeMap || !fileContentsMap) {
      return
    }
    ydocRef.current?.transact(() => {
      ids.forEach((id) => {
        fileTreeMap.delete(id)
        fileContentsMap.delete(id)
      })
    })
  }, [])

  return {
    bindEditor,
    getContent,
    setFileContent,
    getAllFilesContent,
    fileTree,
    workspaceName,
    setWorkspaceName,
    upsertFileEntry,
    batchUpsertEntries,
    importEntriesInBatches,
    batchUpdateEntries,
    updateFileEntry,
    deleteEntry,
    deleteFileEntries,
    activeUsersByFile,
    awarenessClientId,
    remoteUpdateVersion,
    awareness: awarenessRef.current,
  }
}
