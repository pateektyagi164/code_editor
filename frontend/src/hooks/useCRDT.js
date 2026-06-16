import { useCallback, useEffect, useRef } from 'react'
import * as Y from 'yjs'
import { MonacoBinding } from 'y-monaco'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness'

const MSG_UPDATE = 0x00
const MSG_SYNC_REQUEST = 0x01
const MSG_SYNC_RESPONSE = 0x02
const MSG_AWARENESS = 0x06

function ensureYText(filesMap, fileId, initialContent = '') {
  let ytext = filesMap.get(fileId)
  if (!ytext) {
    ytext = new Y.Text()
    filesMap.set(fileId, ytext)
    if (initialContent) {
      ytext.insert(0, initialContent)
    }
  }
  return ytext
}

export function useCRDT({
  send,
  addMessageListener,
  connected,
  fileTree = [],
  activeFileId = 'main',
  initialContent = '',
  user = null,
}) {
  const ydocRef = useRef(null)
  const filesMapRef = useRef(null)
  const awarenessRef = useRef(null)
  const bindingRef = useRef(null)
  const editorRef = useRef(null)
  const modelRef = useRef(null)

  useEffect(() => {
    const ydoc = new Y.Doc()
    const awareness = new Awareness(ydoc)
    const filesMap = ydoc.getMap('workspace_files')

    ydocRef.current = ydoc
    awarenessRef.current = awareness
    filesMapRef.current = filesMap

    const handleLocalUpdate = (update, origin) => {
      if (origin === 'remote') {
        return
      }
      const payload = new Uint8Array(update.length + 1)
      payload[0] = MSG_UPDATE
      payload.set(update, 1)
      send(payload)
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
      send(payload)
    }

    ydoc.on('update', handleLocalUpdate)
    awareness.on('update', handleAwarenessUpdate)

    const removeListener = addMessageListener((data) => {
      if (!data.length) {
        return
      }

      const type = data[0]
      const payload = data.slice(1)

      if (type === MSG_UPDATE || type === MSG_SYNC_RESPONSE) {
        Y.applyUpdate(ydoc, payload, 'remote')
      } else if (type === MSG_AWARENESS) {
        applyAwarenessUpdate(awareness, payload, 'remote')
      } else if (type === MSG_SYNC_REQUEST) {
        const state = Y.encodeStateAsUpdate(ydoc)
        const response = new Uint8Array(state.length + 1)
        response[0] = MSG_SYNC_RESPONSE
        response.set(state, 1)
        send(response)
      }
    })

    return () => {
      removeListener()
      ydoc.off('update', handleLocalUpdate)
      awareness.off('update', handleAwarenessUpdate)
      bindingRef.current?.destroy()
      bindingRef.current = null
      awareness.destroy()
      ydoc.destroy()
      ydocRef.current = null
      filesMapRef.current = null
      awarenessRef.current = null
    }
  }, [send, addMessageListener])

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
    })
  }, [user])

  useEffect(() => {
    const filesMap = filesMapRef.current
    if (!filesMap) {
      return
    }

    fileTree.forEach((file, index) => {
      if (file.type === 'folder') {
        return
      }
      ensureYText(filesMap, file.id, index === 0 ? initialContent : file.content || '')
    })
  }, [fileTree, initialContent])

  useEffect(() => {
    if (!connected) {
      return
    }
    send(new Uint8Array([MSG_SYNC_REQUEST]))
  }, [connected, send])

  const rebindEditor = useCallback(() => {
    const filesMap = filesMapRef.current
    const editor = editorRef.current
    const model = modelRef.current
    const awareness = awarenessRef.current
    if (!filesMap || !editor || !model) {
      return
    }

    const activeFile = fileTree.find((file) => file.id === activeFileId)
    const ytext = ensureYText(filesMap, activeFileId, activeFile?.content || initialContent)
    bindingRef.current?.destroy()
    bindingRef.current = new MonacoBinding(ytext, model, new Set([editor]), awareness)
  }, [activeFileId, fileTree, initialContent])

  useEffect(() => {
    rebindEditor()
  }, [rebindEditor])

  const bindEditor = useCallback(
    (editor, model) => {
      editorRef.current = editor
      modelRef.current = model
      rebindEditor()
    },
    [rebindEditor],
  )

  const getContent = useCallback((fileId = activeFileId) => {
    const filesMap = filesMapRef.current
    if (!filesMap) {
      return ''
    }
    return ensureYText(filesMap, fileId).toString()
  }, [activeFileId])

  const setFileContent = useCallback((fileId, content) => {
    const filesMap = filesMapRef.current
    if (!filesMap) {
      return
    }

    const ytext = ensureYText(filesMap, fileId)
    ytext.delete(0, ytext.length)
    if (content) {
      ytext.insert(0, content)
    }
  }, [])

  const getAllFilesContent = useCallback(() => {
    const filesMap = filesMapRef.current
    const contents = {}
    if (!filesMap) {
      return contents
    }

    fileTree.forEach((file) => {
      if (file.type !== 'folder') {
        contents[file.id] = ensureYText(filesMap, file.id).toString()
      }
    })
    return contents
  }, [fileTree])

  return { bindEditor, getContent, setFileContent, getAllFilesContent, awareness: awarenessRef.current }
}
