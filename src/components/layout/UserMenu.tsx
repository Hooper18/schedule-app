import { useEffect, useRef, useState } from 'react'
import { User, Settings, LogOut } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

export default function UserMenu() {
  const { user, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`p-2 rounded-lg hover:bg-hover transition-colors ${
          open ? 'bg-hover text-text' : 'text-dim'
        }`}
        aria-label="用户菜单"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <User size={18} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-56 rounded-xl bg-main border border-border shadow-lg overflow-hidden z-30"
        >
          <div className="px-3 py-2 border-b border-border">
            <div className="text-[10px] uppercase tracking-wider text-muted">
              当前账号
            </div>
            <div className="text-xs text-text truncate mt-0.5">
              {user?.email ?? '—'}
            </div>
          </div>

          <button
            type="button"
            disabled
            title="暂未开放"
            className="w-full px-3 py-2.5 flex items-center gap-2 text-sm text-muted cursor-not-allowed"
          >
            <Settings size={14} />
            <span>设置</span>
            <span className="ml-auto text-[10px] text-muted">暂未开放</span>
          </button>

          <div className="border-t border-border" />

          <button
            type="button"
            onClick={async () => {
              setOpen(false)
              await signOut()
            }}
            className="w-full px-3 py-2.5 flex items-center gap-2 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
          >
            <LogOut size={14} />
            <span>登出</span>
          </button>
        </div>
      )}
    </div>
  )
}
