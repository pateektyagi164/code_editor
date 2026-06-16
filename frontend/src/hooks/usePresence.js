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
        const json = JSON.parse(new TextDecoder().decode(data.slice(1)))
        if (Array.isArray(json.users)) {
          setActiveUsers(json.users)
        }
      } catch {
        // ignore malformed presence payloads
      }
    })

    return removeListener
  }, [addMessageListener])

  return { activeUsers }
}
