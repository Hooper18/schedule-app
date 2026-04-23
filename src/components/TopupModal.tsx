import { X, Wallet, RefreshCw } from 'lucide-react'
import { useEffect } from 'react'
import { useBalance, type BalanceTransaction } from '../hooks/useBalance'
import { formatUSD, LOW_BALANCE_THRESHOLD_USD } from '../lib/balance'
import { useAuth } from '../contexts/AuthContext'

type Props = {
  onClose: () => void
}

export default function TopupModal({ onClose }: Props) {
  const { user } = useAuth()
  const { balance, transactions, loading, reload } = useBalance()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const low = balance !== null && balance < LOW_BALANCE_THRESHOLD_USD

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-main border border-border rounded-2xl max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Wallet size={18} className="text-accent" />
            <h2 className="text-base font-semibold">充值</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-hover text-dim"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Balance card */}
          <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-muted">当前余额</div>
              <div
                className={`text-2xl font-semibold mt-1 ${low ? 'text-red-500' : 'text-text'}`}
              >
                {balance === null ? '…' : formatUSD(balance)}
              </div>
              {low && (
                <div className="text-xs text-red-500 mt-1">余额不足，请充值</div>
              )}
            </div>
            <button
              onClick={reload}
              disabled={loading}
              className="p-2 rounded-lg hover:bg-hover text-dim disabled:opacity-50"
              aria-label="刷新余额"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Instructions */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">如何充值</h3>
            <p className="text-xs text-dim leading-relaxed">
              请通过微信 / 支付宝按汇率转账到下方账号（$ 按当日汇率折算为
              人民币），备注
              <span className="text-text font-medium mx-1">
                {user?.email ?? '你的注册邮箱'}
              </span>
              ，管理员将在 24 小时内为你充值。
            </p>

            {/* QR placeholder — replace the image later */}
            <div className="flex justify-center py-3">
              <div className="w-40 h-40 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center text-muted text-xs gap-1">
                <span>收款二维码</span>
                <span className="text-[10px]">（暂用占位图）</span>
              </div>
            </div>
          </div>

          {/* Transactions */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">交易记录</h3>
            {transactions.length === 0 ? (
              <div className="text-xs text-muted py-4 text-center">暂无记录</div>
            ) : (
              <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
                {transactions.map((t) => (
                  <TransactionRow key={t.id} tx={t} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function TransactionRow({ tx }: { tx: BalanceTransaction }) {
  const isCredit = tx.type === 'topup' || tx.type === 'refund'
  const sign = isCredit ? '+' : '-'
  const color = isCredit ? 'text-emerald-500' : 'text-red-500'
  const amount = Math.abs(Number(tx.amount_cny))
  const date = new Date(tx.created_at)
  const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date
    .getHours()
    .toString()
    .padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`

  return (
    <li className="px-3 py-2.5 flex items-center justify-between bg-card">
      <div className="min-w-0">
        <div className="text-sm truncate">{tx.description ?? tx.type}</div>
        <div className="text-[10px] text-muted mt-0.5">{dateStr}</div>
      </div>
      <div className={`text-sm font-medium ${color}`}>
        {sign}
        {formatUSD(amount)}
      </div>
    </li>
  )
}
