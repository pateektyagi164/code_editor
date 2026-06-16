import { useEffect, useRef, useState } from 'react'
import { MSG_PING, MSG_PONG } from '../utils/wsProtocol.js'

const PING_INTERVAL_MS = 2500

export function useNetworkMetrics({ send, connected, addMessageListener }) {
  const [latencyMs, setLatencyMs] = useState(null)
  const pendingRef = useRef(new Map())

  useEffect(() => {
    if (!connected) {
      setLatencyMs(null)
      pendingRef.current.clear()
      return undefined
    }

    const removeListener = addMessageListener((data) => {
      if (!data.length || data[0] !== MSG_PONG) {
        return
      }

      if (data.length < 9) {
        return
      }

      const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
      const sentAt = Number(view.getBigUint64(1))
      const pending = pendingRef.current.get(sentAt)
      if (pending) {
        clearTimeout(pending)
        pendingRef.current.delete(sentAt)
        setLatencyMs(Math.max(0, Date.now() - sentAt))
      }
    })

    const interval = window.setInterval(() => {
      const sentAt = Date.now()
      const payload = new Uint8Array(9)
      payload[0] = MSG_PING
      new DataView(payload.buffer).setBigUint64(1, BigInt(sentAt))

      const timeout = window.setTimeout(() => {
        pendingRef.current.delete(sentAt)
      }, 5000)

      pendingRef.current.set(sentAt, timeout)
      send(payload)
    }, PING_INTERVAL_MS)

    return () => {
      removeListener()
      clearInterval(interval)
      pendingRef.current.forEach(clearTimeout)
      pendingRef.current.clear()
    }
  }, [connected, send, addMessageListener])

  return { latencyMs }
}
