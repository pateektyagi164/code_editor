export default function LatencyTracker({ latencyMs, connected }) {
  if (!connected) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <span className="inline-flex w-2 h-2 rounded-full bg-slate-600" />
        <span className="font-mono">offline</span>
      </div>
    )
  }

  if (latencyMs == null) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <span className="inline-flex w-2 h-2 rounded-full bg-slate-500 animate-pulse" />
        <span className="font-mono">…</span>
      </div>
    )
  }

  let colorClass = 'text-emerald-400'
  let dotClass = 'bg-emerald-400 shadow-glow-accent'

  if (latencyMs > 100) {
    colorClass = 'text-amber-400'
    dotClass = 'bg-amber-400'
  } else if (latencyMs > 50) {
    colorClass = 'text-yellow-300'
    dotClass = 'bg-yellow-300'
  }

  return (
    <div className={`flex items-center gap-1.5 text-xs ${colorClass}`}>
      <span className={`inline-flex w-2 h-2 rounded-full ${dotClass}`} />
      <span className="font-mono">{latencyMs}ms</span>
    </div>
  )
}
