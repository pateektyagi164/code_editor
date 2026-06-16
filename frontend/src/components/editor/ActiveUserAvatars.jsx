function UserAvatar({ user, index }) {
  const initial = user.user_name?.charAt(0)?.toUpperCase() || '?'

  return (
    <div
      className="relative group"
      style={{ zIndex: 10 - index }}
      title={user.user_name}
    >
      {user.avatar_url ? (
        <img
          src={user.avatar_url}
          alt={user.user_name}
          className="w-7 h-7 rounded-lg object-cover ring-2 ring-slate-900 shadow-glow-accent"
        />
      ) : (
        <div className="w-7 h-7 rounded-lg bg-accent/20 ring-2 ring-slate-900 flex items-center justify-center text-xs font-medium text-accent shadow-glow-accent">
          {initial}
        </div>
      )}
      <span className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-850 px-2 py-0.5 text-[10px] text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity border border-slate-700/50">
        {user.user_name}
      </span>
    </div>
  )
}

export default function ActiveUserAvatars({ users = [], connected }) {
  if (!connected || users.length === 0) {
    return null
  }

  const visible = users.slice(0, 5)
  const overflow = users.length - visible.length

  return (
    <div className="flex items-center">
      <div className="flex items-center -space-x-2">
        {visible.map((user, index) => (
          <UserAvatar key={user.user_id} user={user} index={index} />
        ))}
      </div>
      {overflow > 0 && (
        <span className="ml-2 text-xs text-slate-500 font-mono">+{overflow}</span>
      )}
    </div>
  )
}
