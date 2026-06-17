import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
})

let accessToken = null
let isRefreshing = false
let failedQueue = []
const AUTH_FLAG = 'code_collab_auth'
const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || ''

function getApiOrigin() {
  if (API_ORIGIN) {
    return API_ORIGIN.replace(/\/$/, '')
  }
  const hostname = window.location.hostname || 'localhost'
  return `${window.location.protocol}//${hostname}:8000`
}

function processQueue(error, token = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error)
    } else {
      resolve(token)
    }
  })
  failedQueue = []
}

export function setAccessToken(token) {
  accessToken = token
  if (token) {
    localStorage.setItem(AUTH_FLAG, '1')
  }
}

export function getAccessToken() {
  return accessToken
}

export function clearAccessToken() {
  accessToken = null
  localStorage.removeItem(AUTH_FLAG)
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    const requestUrl = original?.url ?? ''

    if (requestUrl.includes('/auth/refresh') || requestUrl.includes('/auth/bootstrap')) {
      clearAccessToken()
      return Promise.reject(error)
    }

    if (error.response?.status === 401 && original && !original._retry && localStorage.getItem(AUTH_FLAG)) {
      original._retry = true

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
          if (token) {
            original.headers.Authorization = `Bearer ${token}`
          }
          return api(original)
        })
      }

      isRefreshing = true
      try {
        const { data } = await api.post('/auth/refresh')
        setAccessToken(data.access_token)
        processQueue(null, data.access_token)
        if (data.access_token) {
          original.headers.Authorization = `Bearer ${data.access_token}`
        }
        return api(original)
      } catch (refreshError) {
        clearAccessToken()
        processQueue(refreshError, null)
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  },
)

export async function bootstrapAccessToken({ forceRefresh = false } = {}) {
  if (!forceRefresh && !localStorage.getItem(AUTH_FLAG)) {
    return null
  }

  try {
    let data
    try {
      const response = await api.post('/auth/bootstrap')
      data = response.data
    } catch (error) {
      if (error.response?.status !== 404) {
        throw error
      }
      const response = await api.post('/auth/refresh')
      data = response.data
    }
    if (data.access_token) {
      setAccessToken(data.access_token)
    } else if (data.authenticated) {
      localStorage.setItem(AUTH_FLAG, '1')
    }
    return data.access_token
  } catch {
    clearAccessToken()
    return null
  }
}

export async function fetchAuthProviders() {
  const { data } = await api.get('/auth/providers')
  return data
}

export async function fetchCurrentUser() {
  const { data } = await api.get('/auth/me')
  return data
}

export async function logoutUser() {
  await api.post('/auth/logout')
  clearAccessToken()
}

export function getOAuthLoginUrl(provider, nextPath = window.location.pathname) {
  const next = `${nextPath}${window.location.search || ''}`
  return `${getApiOrigin()}/api/v1/auth/${provider}/login?next=${encodeURIComponent(next)}`
}

export async function createRoom({ name = 'Untitled Workspace' } = {}) {
  try {
    const { data } = await api.post('/rooms', { name })
    return {
      room_id: data.room_id,
      name: data.name || name,
      created_at: data.created_at || new Date().toISOString(),
    }
  } catch (error) {
    if (![404, 405, 307, 308].includes(error.response?.status)) {
      if (error.response?.status && error.response.status >= 500) {
        return {
          room_id: crypto.randomUUID(),
          name,
          created_at: new Date().toISOString(),
          local_only: true,
        }
      }
      throw error
    }
    try {
      const { data } = await api.post('/rooms/', { name })
      return {
        room_id: data.room_id,
        name: data.name || name,
        created_at: data.created_at || new Date().toISOString(),
      }
    } catch {
      return {
        room_id: crypto.randomUUID(),
        name,
        created_at: new Date().toISOString(),
        local_only: true,
      }
    }
  }
}

export async function fetchRooms() {
  try {
    const { data } = await api.get('/rooms')
    return data
  } catch (error) {
    if (![404, 405, 307, 308].includes(error.response?.status)) {
      throw error
    }
    try {
      const { data } = await api.get('/rooms/')
      return data
    } catch (retryError) {
      if ([404, 405].includes(retryError.response?.status)) {
        return []
      }
      throw retryError
    }
  }
}

export async function fetchRoom(roomId) {
  const { data } = await api.get(`/rooms/${roomId}`)
  return data
}

export async function updateRoom(roomId, payload) {
  const { data } = await api.patch(`/rooms/${roomId}`, payload)
  return data
}

export async function deleteRoom(roomId) {
  await api.delete(`/rooms/${roomId}`)
}

export async function runCode({ sourceCode, languageId = 71, language = 'python', stdin = null }) {
  const { data } = await api.post(
    '/execution/run',
    {
      source_code: sourceCode,
      language_id: languageId,
      language,
      stdin,
    },
    { timeout: 60000 },
  )
  return data
}

export async function fetchExecutionLanguages() {
  const { data } = await api.get('/execution/languages')
  return data.languages
}

export default api
