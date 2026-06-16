import { useEffect, useRef, useState } from 'react'

function formatMetric(value, unit) {
  if (value == null) {
    return '—'
  }
  return `${value}${unit}`
}

function getErrorHeadline(result) {
  if (!result?.stderr) {
    return null
  }

  const firstMeaningfulLine = result.stderr
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)

  if (result.error_line) {
    const column = result.error_column ? `:${result.error_column}` : ''
    return `${result.error_file || 'active file'}:${result.error_line}${column}`
  }

  return firstMeaningfulLine || 'Execution error'
}

export default function OutputTerminal({
  onRun,
  running = false,
  result = null,
  stdinEnabled = true,
}) {
  const [stdin, setStdin] = useState('')
  const outputRef = useRef(null)

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [result, running])

  const handleRun = () => {
    onRun?.(stdinEnabled ? stdin : null)
  }

  const handleKeyDown = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      if (!running) {
        handleRun()
      }
    }
  }

  const outputText = running
    ? 'Running…'
    : [result?.stdout, result?.stderr].filter(Boolean).join('\n') || 'Output will appear here after you run the code.'

  const isError = Boolean(result?.stderr) || result?.status === 'Runtime Error (NZEC)'
  const errorHeadline = getErrorHeadline(result)

  return (
    <div className="panel flex flex-col shrink-0 h-52 min-h-44">
      <div className="panel-header flex items-center justify-between gap-3">
        <span>Terminal</span>
        <div className="flex items-center gap-2">
          {result && !running && (
            <span
              className={`text-xs font-mono px-2 py-0.5 rounded-md border ${
                isError
                  ? 'text-red-400 border-red-400/20 bg-red-400/10'
                  : 'text-emerald-400 border-emerald-400/20 bg-emerald-400/10'
              }`}
            >
              {result.status}
            </span>
          )}
          <button
            type="button"
            onClick={handleRun}
            disabled={running}
            className="px-3 py-1 text-xs font-medium rounded-lg bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 hover:shadow-glow transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? 'Running…' : 'Run ▶'}
          </button>
        </div>
      </div>

      {stdinEnabled && (
        <div className="px-4 py-2 border-b border-slate-700/50">
          <label className="block text-xs text-slate-500 mb-1">Input (stdin)</label>
          <textarea
            value={stdin}
            onChange={(event) => setStdin(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            placeholder="Optional program input…"
            className="w-full resize-none px-3 py-2 text-xs font-mono rounded-lg bg-slate-950 border border-slate-700/50 text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-accent/40"
          />
        </div>
      )}

      <div
        ref={outputRef}
        className="flex-1 overflow-auto px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap"
      >
        {errorHeadline && !running && (
          <div className="mb-2 rounded-md border border-red-400/20 bg-red-400/10 px-2 py-1 text-red-200">
            {errorHeadline}
          </div>
        )}
        <span className={running ? 'text-accent' : isError ? 'text-red-300' : 'text-slate-300'}>
          {outputText}
        </span>
      </div>

      <div className="border-t border-slate-700/50 px-4 py-2 flex items-center justify-between text-xs text-slate-500">
        <span>Ctrl+Enter to run</span>
        <div className="flex items-center gap-3 font-mono">
          <span>Time: {formatMetric(result?.time_ms, ' ms')}</span>
          <span>Memory: {formatMetric(result?.memory_kb, ' KB')}</span>
        </div>
      </div>
    </div>
  )
}
