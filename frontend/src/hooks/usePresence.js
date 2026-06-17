import { useEffect, useState } from 'react'
import { MSG_PRESENCE } from '../utils/wsProtocol.js'

export function usePresence({ addMessageListener, connected }) {
  const [activeUsers, setActiveUsers] = useState([])

  useEffect(() => {
    if (!connected) {
      setActiveUsers([])
    }
  }, [connected])

  useEffect(() => {
    const removeListener = addMessageListener((data) => {
      if (!data.length || data[0] !== MSG_PRESENCE) {
        return
      }
      try {
        const payload = new TextDecoder().decode(data.slice(1))
        const parsed = JSON.parse(payload)
        setActiveUsers(Array.isArray(parsed.users) ? parsed.users : [])
      } catch {
        setActiveUsers([])
      }
    })

    return removeListener
  }, [addMessageListener])

  return { activeUsers }
}
