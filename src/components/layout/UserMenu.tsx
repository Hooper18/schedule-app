import { useEffect, useRef, useState } from 'react'
import {
  User,
  Settings,
  LogOut,
  Wallet,
  HelpCircle,
  Ticket,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useBalance } from '../../hooks/useBalance'
import { formatUSD, LOW_BALANCE_THRESHOLD_USD } from '../../lib/balance'
import TopupModal from '../TopupModal'
import HelpModal from '../HelpModal'
import RedeemInviteModal from '../RedeemInviteModal'

export default function UserMenu() {
  const { user, signOut } = useAuth()
  const { balance } = useBalance()
  const [open, setOpen] = useState(false)
  const [topupOpen, setTopupOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [redeemOpen, setRedeemOpen] = useState(false)
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

  const low = balance !== null && balance < LOW_BALANCE_THRESHOLD_USD

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
          className="absolute right-0 top-full mt-1 w-60 rounded-xl bg-main border border-border shadow-lg overflow-hidden z-30"
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
            onClick={() => {
              setOpen(false)
              setTopupOpen(true)
            }}
            className="w-full px-3 py-2.5 flex items-center gap-2 text-sm text-text hover:bg-hover transition-colors"
          >
            <Wallet size={14} className={low ? 'text-red-500' : 'text-dim'} />
            <span>余额</span>
            <span
              className={`ml-auto text-xs ${low ? 'text-red-500 font-medium' : 'text-dim'}`}
            >
              {balance === null ? '…' : formatUSD(balance)}
              <span className="ml-1 text-[9px] text-muted font-normal">
                USD
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setOpen(false)
              setRedeemOpen(true)
            }}
            className="w-full px-3 py-2.5 flex items-center gap-2 text-sm text-text hover:bg-hover transition-colors"
          >
            <Ticket size={14} className="text-dim" />
            <span>兑换邀请码</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setOpen(false)
              setHelpOpen(true)
            }}
            className="w-full px-3 py-2.5 flex items-center gap-2 text-sm text-text hover:bg-hover transition-colors"
          >
            <HelpCircle size={14} className="text-dim" />
            <span>帮助 / 教程</span>
          </button>

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

      {topupOpen && <TopupModal onClose={() => setTopupOpen(false)} />}
      <RedeemInviteModal
        open={redeemOpen}
        onClose={() => setRedeemOpen(false)}
      />
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
