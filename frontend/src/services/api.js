import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
})

let accessToken = null
let refreshPromise = null
const AUTH_FLAG = 'code_collab_auth'
const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || 'http://localhost:8000'

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

function getCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

function clearCookie(name) {
  document.cookie = `${name}=; path=/; max-age=0`
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

    if (requestUrl.includes('/auth/refresh')) {
      clearAccessToken()
      return Promise.reject(error)
    }

    if (error.response?.status === 401 && !original._retry && accessToken) {
      original._retry = true

      try {
        if (!refreshPromise) {
          refreshPromise = api.post('/auth/refresh').finally(() => {
            refreshPromise = null
          })
        }
        const { data } = await refreshPromise
        setAccessToken(data.access_token)
        original.headers.Authorization = `Bearer ${data.access_token}`
        return api(original)
      } catch {
        clearAccessToken()
        return Promise.reject(error)
      }
    }

    return Promise.reject(error)
  },
)

export async function bootstrapAccessToken() {
  const cookieToken = getCookie('access_token')
  if (cookieToken) {
    setAccessToken(cookieToken)
    clearCookie('access_token')
    return cookieToken
  }

  if (!localStorage.getItem(AUTH_FLAG)) {
    return null
  }

  try {
    const { data } = await api.post('/auth/refresh')
    setAccessToken(data.access_token)
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
  if (!accessToken) {
    return null
  }
  const { data } = await api.get('/auth/me')
  return data
}

export async function logoutUser() {
  await api.post('/auth/logout')
  clearAccessToken()
}

export function getOAuthLoginUrl(provider, nextPath = window.location.pathname) {
  const next = `${nextPath}${window.location.search || ''}`
  return `${API_ORIGIN}/api/v1/auth/${provider}/login?next=${encodeURIComponent(next)}`
}

export async function createRoom({ name = 'Untitled Workspace' } = {}) {
  const { data } = await api.post('/rooms', { name })
  return data
}

export async function fetchRooms() {
  const { data } = await api.get('/rooms')
  return data
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
