import { useCallback, useEffect, useRef, useState } from 'react'
import { getAccessToken } from '../services/api.js'

function getWebSocketBaseUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}`
}

export function useWebSockets(roomId, enabled = true) {
  const [connected, setConnected] = useState(false)
  const wsRef = useRef(null)
  const listenersRef = useRef(new Set())
  const reconnectTimerRef = useRef(null)

  const send = useCallback((data) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(data)
    }
  }, [])

  const addMessageListener = useCallback((listener) => {
    listenersRef.current.add(listener)
    return () => listenersRef.current.delete(listener)
  }, [])

  useEffect(() => {
    if (!enabled || !roomId) {
      setConnected(false)
      return undefined
    }

    let closed = false

    function connect() {
      const token = getAccessToken()
      if (!token) {
        return
      }

      const url = `${getWebSocketBaseUrl()}/ws/room/${encodeURIComponent(roomId)}?token=${encodeURIComponent(token)}`
      const ws = new WebSocket(url)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
      }

      ws.onmessage = (event) => {
        const data = new Uint8Array(event.data)
        listenersRef.current.forEach((listener) => listener(data))
      }

      ws.onclose = () => {
        setConnected(false)
        wsRef.current = null
        if (!closed) {
          reconnectTimerRef.current = window.setTimeout(connect, 2000)
        }
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      closed = true
      clearTimeout(reconnectTimerRef.current)
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      setConnected(false)
    }
  }, [roomId, enabled])

  return { send, connected, addMessageListener }
}
