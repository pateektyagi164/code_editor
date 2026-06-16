import { createContext, useContext, useMemo } from 'react'
import { useAuth } from './AuthContext.jsx'
import { useNetworkMetrics } from '../hooks/useNetworkMetrics.js'
import { usePresence } from '../hooks/usePresence.js'
import { useWebSockets } from '../hooks/useWebSockets.js'

const RoomContext = createContext(null)

export function RoomProvider({ roomId = 'default', children }) {
  const { isAuthenticated } = useAuth()
  const { send, connected, addMessageListener } = useWebSockets(roomId, isAuthenticated)
  const { latencyMs } = useNetworkMetrics({ send, connected, addMessageListener })
  const { activeUsers } = usePresence({ addMessageListener, connected })

  const value = useMemo(
    () => ({
      roomId,
      send,
      connected,
      addMessageListener,
      latencyMs,
      activeUsers,
    }),
    [roomId, send, connected, addMessageListener, latencyMs, activeUsers],
  )

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>
}

export function useRoom() {
  const context = useContext(RoomContext)
  if (!context) {
    throw new Error('useRoom must be used within RoomProvider')
  }
  return context
}
