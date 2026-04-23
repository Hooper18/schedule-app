import { useEffect, useState } from 'react'
import { Ticket, CheckCircle2 } from 'lucide-react'
import Modal from './shared/Modal'
import { supabase } from '../lib/supabase'
import { useBalance } from '../hooks/useBalance'
import { formatUSD } from '../lib/balance'

interface Props {
  open: boolean
  onClose: () => void
}

// Maps the RAISE EXCEPTION strings from redeem_invite_code() to UI copy.
// Unknown messages fall through as-is so server changes remain visible.
function friendlyError(raw: string): string {
  if (raw.includes('already redeemed')) {
    return '你已兑换过邀请码，每个账号只能兑换一次'
  }
  if (raw.includes('invalid or used code')) {
    return '邀请码无效或已被使用'
  }
  if (raw.includes('not authenticated')) {
    return '请先登录'
  }
  return raw
}

export default function RedeemInviteModal({ open, onClose }: Props) {
  const { reload: reloadBalance } = useBalance()
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // When set, we've just succeeded. The modal lingers for a beat so the
  // user can read the confirmation, then auto-closes.
  const [successBalance, setSuccessBalance] = useState<number | null>(null)

  // Reset local state every time the modal opens — otherwise a user who
  // closed with an error and reopens would see stale messaging.
  useEffect(() => {
    if (open) {
      setCode('')
      setErr(null)
      setSuccessBalance(null)
      setSubmitting(false)
    }
  }, [open])

  useEffect(() => {
    if (successBalance === null) return
    const t = window.setTimeout(() => onClose(), 1800)
    return () => window.clearTimeout(t)
  }, [successBalance, onClose])

  const redeem = async () => {
    const trimmed = code.trim()
    if (!trimmed) {
      setErr('请输入邀请码')
      return
    }
    setSubmitting(true)
    setErr(null)
    const { data, error } = await supabase.rpc('redeem_invite_code', {
      p_code: trimmed,
    })
    setSubmitting(false)
    if (error) {
      setErr(friendlyError(error.message))
      return
    }
    // new_balance is returned as JSON; supabase-js delivers it as a parsed
    // object. Falls back to null if the server ever drops the field.
    const newBalance =
      typeof data === 'object' && data !== null && 'new_balance' in data
        ? Number((data as { new_balance: number }).new_balance)
        : null
    setSuccessBalance(newBalance)
    reloadBalance()
  }

  return (
    <Modal open={open} title="兑换邀请码" onClose={onClose}>
      {successBalance !== null ? (
        <div className="py-4 flex flex-col items-center gap-2 text-center">
          <CheckCircle2 size={36} className="text-emerald-500" />
          <div className="text-text font-semibold">兑换成功</div>
          <div className="text-sm text-dim">
            已到账 $1.00，当前余额{' '}
            <span className="text-text font-mono font-semibold">
              {formatUSD(successBalance)}
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start gap-2 text-xs text-dim">
            <Ticket size={14} className="shrink-0 mt-0.5 text-accent" />
            <span>
              输入邀请码兑换 <span className="text-text font-semibold">$1.00</span>
              {' '}
              余额，用于 AI 解析消费。每个账号只能兑换一次。
            </span>
          </div>
          <input
            autoFocus
            value={code}
            onChange={(e) => {
              // Invite codes are uppercase letters + digits — normalize
              // aggressively so users pasting lowercase or with whitespace
              // still land on a matching row.
              const v = e.target.value.toUpperCase().replace(/\s+/g, '')
              setCode(v)
              if (err) setErr(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !submitting) {
                e.preventDefault()
                redeem()
              }
            }}
            placeholder="XXXXXXXX"
            maxLength={16}
            disabled={submitting}
            className="w-full px-3 py-2.5 rounded-lg bg-card border border-border text-text text-center font-mono text-lg tracking-[0.25em] placeholder:text-muted focus:outline-none focus:border-accent uppercase"
          />
          {err && (
            <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {err}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-3 py-2.5 rounded-lg bg-card border border-border text-dim text-sm"
            >
              取消
            </button>
            <button
              type="button"
              onClick={redeem}
              disabled={submitting || !code.trim()}
              className="flex-1 py-2.5 rounded-lg bg-accent text-white text-sm font-medium disabled:opacity-60"
            >
              {submitting ? '兑换中…' : '兑换'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
