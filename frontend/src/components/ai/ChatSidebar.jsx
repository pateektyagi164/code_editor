import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { fetchAIStatus, streamChat } from '../../services/sseClient.js'

const QUICK_PROMPTS = [
  { label: 'Explain', message: 'Explain what this code does in plain language.' },
  { label: 'Find bugs', message: 'Review this code for bugs and edge cases.' },
  { label: 'Refactor', message: 'Suggest a cleaner refactor with brief rationale.' },
  { label: 'Add tests', message: 'Write unit tests for the main logic in this file.' },
]

function MessageBubble({ role, content, streaming = false }) {
  const isUser = role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[92%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-accent/15 text-slate-200 border border-accent/20'
            : 'bg-slate-850 text-slate-300 border border-slate-700/50'
        }`}
      >
        {content}
        {streaming && <span className="inline-block w-1.5 h-4 ml-0.5 bg-accent animate-pulse align-middle" />}
      </div>
    </div>
  )
}

export default function ChatSidebar({ getCodeRef, language = 'python', fileName = 'main.py' }) {
  const { isAuthenticated, setShowLogin } = useAuth()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [aiStatus, setAiStatus] = useState(null)
  const [error, setError] = useState(null)
  const abortRef = useRef(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    fetchAIStatus().then(setAiStatus).catch(() => setAiStatus({ configured: false }))
  }, [])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streaming])

  const sendMessage = useCallback(
    async (text) => {
      const trimmed = text.trim()
      if (!trimmed || streaming) {
        return
      }

      if (!isAuthenticated) {
        setShowLogin(true)
        return
      }

      setError(null)
      setInput('')
      setStreaming(true)

      const userMessage = { role: 'user', content: trimmed }
      const assistantMessage = { role: 'assistant', content: '' }

      setMessages((prev) => [...prev, userMessage, assistantMessage])

      const controller = new AbortController()
      abortRef.current = controller

      try {
        await streamChat({
          message: trimmed,
          codeContext: getCodeRef?.current?.() || null,
          language,
          fileName,
          signal: controller.signal,
          onToken: (token) => {
            setMessages((prev) => {
              const next = [...prev]
              const last = next[next.length - 1]
              if (last?.role === 'assistant') {
                next[next.length - 1] = { ...last, content: last.content + token }
              }
              return next
            })
          },
          onError: (err) => {
            setError(err.message)
          },
        })
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Failed to get AI response')
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant' && !last.content) {
              next.pop()
            }
            return next
          })
        }
      } finally {
        setStreaming(false)
        abortRef.current = null
      }
    },
    [streaming, isAuthenticated, setShowLogin, getCodeRef, language, fileName],
  )

  const handleSubmit = (event) => {
    event.preventDefault()
    sendMessage(input)
  }

  const handleStop = () => {
    abortRef.current?.abort()
    setStreaming(false)
  }

  return (
    <div className="panel flex flex-col flex-1 min-h-0 shadow-glow">
      <div className="panel-header flex items-center justify-between">
        <span>AI Assistant</span>
        {aiStatus && (
          <span className="text-[10px] font-mono text-slate-500">
            {aiStatus.configured ? aiStatus.model : 'not configured'}
          </span>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 p-4 flex flex-col gap-3 overflow-auto min-h-0">
        {messages.length === 0 && (
          <div className="rounded-lg bg-slate-850 border border-slate-700/50 p-3 space-y-3">
            <p className="text-sm text-slate-400 leading-relaxed">
              Ask about your code — responses stream in real time with full editor context.
            </p>
            {!aiStatus?.configured && (
              <p className="text-xs text-amber-400/90 leading-relaxed">
                Add <code className="font-mono text-amber-300">OPENAI_API_KEY</code> or{' '}
                <code className="font-mono text-amber-300">GEMINI_API_KEY</code> to backend/.env
              </p>
            )}
          </div>
        )}

        {messages.map((message, index) => (
          <MessageBubble
            key={`${message.role}-${index}`}
            role={message.role}
            content={message.content}
            streaming={streaming && index === messages.length - 1 && message.role === 'assistant'}
          />
        ))}

        {error && (
          <div className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}
      </div>

      <div className="px-4 pb-2 flex flex-wrap gap-2">
        {QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt.label}
            type="button"
            disabled={streaming}
            onClick={() => sendMessage(prompt.message)}
            className="px-2.5 py-1 text-xs rounded-lg bg-slate-850 text-slate-400 border border-slate-700/50 hover:text-accent hover:border-accent/30 transition-all disabled:opacity-50"
          >
            {prompt.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="p-4 pt-2 border-t border-slate-700/50">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={isAuthenticated ? 'Ask about your code…' : 'Sign in to chat…'}
            disabled={streaming}
            className="flex-1 px-3 py-2 text-sm rounded-lg bg-slate-950 border border-slate-700/50 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-accent/40 disabled:opacity-60"
          />
          {streaming ? (
            <button
              type="button"
              onClick={handleStop}
              className="px-3 py-2 rounded-lg bg-red-400/10 text-red-300 border border-red-400/20 hover:bg-red-400/20 transition-all"
            >
              ■
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="px-3 py-2 rounded-lg bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 hover:shadow-glow transition-all duration-200 disabled:opacity-50"
            >
              →
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
