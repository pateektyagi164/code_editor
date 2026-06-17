import { useCallback, useEffect, useRef, useState } from 'react'

const INITIAL_BACKOFF_MS = 2000
const MAX_BACKOFF_MS = 30000

function getWebSocketBaseUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}`
}

export function useWebSockets(roomId, enabled = true) {
  const [connected, setConnected] = useState(false)
  const wsRef = useRef(null)
  const listenersRef = useRef(new Set())
  const reconnectTimerRef = useRef(null)
  const backoffRef = useRef(INITIAL_BACKOFF_MS)
  const outboundQueueRef = useRef([])

  const flushQueue = useCallback(() => {
    const ws = wsRef.current
    if (ws?.readyState !== WebSocket.OPEN) {
      return
    }
    while (outboundQueueRef.current.length) {
      ws.send(outboundQueueRef.current.shift())
    }
  }, [])

  const send = useCallback((data) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(data)
      return
    }
    outboundQueueRef.current.push(data)
  }, [])

  const addMessageListener = useCallback((listener) => {
    listenersRef.current.add(listener)
    return () => listenersRef.current.delete(listener)
  }, [])

  useEffect(() => {
    if (!enabled || !roomId) {
      setConnected(false)
      outboundQueueRef.current = []
      return undefined
    }

    let closed = false

    function scheduleReconnect() {
      const delay = backoffRef.current
      reconnectTimerRef.current = window.setTimeout(() => {
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS)
        connect()
      }, delay)
    }

    function connect() {
      const url = `${getWebSocketBaseUrl()}/ws/room/${encodeURIComponent(roomId)}`
      const ws = new WebSocket(url)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = () => {
        backoffRef.current = INITIAL_BACKOFF_MS
        setConnected(true)
        flushQueue()
      }

      ws.onmessage = (event) => {
        const data = new Uint8Array(event.data)
        listenersRef.current.forEach((listener) => listener(data))
      }

      ws.onclose = () => {
        setConnected(false)
        wsRef.current = null
        if (!closed) {
          scheduleReconnect()
        }
      }
    }

    connect()

    return () => {
      closed = true
      clearTimeout(reconnectTimerRef.current)
      backoffRef.current = INITIAL_BACKOFF_MS
      outboundQueueRef.current = []
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      setConnected(false)
    }
  }, [roomId, enabled, flushQueue])

  return { send, connected, addMessageListener }
}
