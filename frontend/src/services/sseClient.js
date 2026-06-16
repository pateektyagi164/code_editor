import { getAccessToken } from './api.js'

export async function streamChat({
  message,
  codeContext = null,
  language = 'python',
  fileName = 'main.py',
  onToken,
  onDone,
  onError,
  signal,
}) {
  const token = getAccessToken()
  if (!token) {
    const error = new Error('Sign in to use the AI assistant')
    onError?.(error)
    throw error
  }

  const response = await fetch('/api/v1/ai/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    credentials: 'include',
    body: JSON.stringify({
      message,
      code_context: codeContext,
      language,
      file_name: fileName,
    }),
    signal,
  })

  if (!response.ok) {
    let detail = 'AI stream failed'
    try {
      const body = await response.json()
      detail = body.detail || detail
    } catch {
      // ignore parse errors
    }
    const error = new Error(detail)
    onError?.(error)
    throw error
  }

  const reader = response.body?.getReader()
  if (!reader) {
    const error = new Error('Streaming is not supported in this browser')
    onError?.(error)
    throw error
  }

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) {
        continue
      }

      const data = line.slice(6).trim()
      if (data === '[DONE]') {
        onDone?.()
        return
      }

      try {
        const parsed = JSON.parse(data)
        if (parsed.error) {
          const error = new Error(parsed.error)
          onError?.(error)
          throw error
        }
        if (parsed.content) {
          onToken?.(parsed.content)
        }
      } catch (error) {
        if (error instanceof SyntaxError) {
          continue
        }
        throw error
      }
    }
  }

  onDone?.()
}

export async function fetchAIStatus() {
  const token = getAccessToken()
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  const response = await fetch('/api/v1/ai/status', { headers, credentials: 'include' })
  if (!response.ok) {
    return { configured: false, provider: 'openai', model: 'unknown' }
  }
  return response.json()
}
