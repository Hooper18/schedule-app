import { CheckCircle2, AlertCircle, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useInviteRedemption } from '../hooks/useInviteRedemption'

// Renders a dismissible banner at the top of the screen after the invite-
// redemption hook returns. Mounted inside AppRoutes so it persists across
// navigation while the banner is visible.
export default function InviteRedemptionBanner() {
  const state = useInviteRedemption()
  const [dismissed, setDismissed] = useState(false)

  // Auto-dismiss success banners after 6s. Failure banners stay until the
  // user clicks the close button.
  useEffect(() => {
    if (state?.status !== 'success') return
    const t = setTimeout(() => setDismissed(true), 6000)
    return () => clearTimeout(t)
  }, [state])

  if (!state || dismissed) return null

  const isSuccess = state.status === 'success'
  const colorClass = isSuccess
    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600'
    : 'bg-amber-500/10 border-amber-500/30 text-amber-600'
  const Icon = isSuccess ? CheckCircle2 : AlertCircle

  return (
    <div className="fixed top-2 left-1/2 -translate-x-1/2 z-40 max-w-md w-[90%]">
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${colorClass}`}
      >
        <Icon size={16} className="shrink-0" />
        <span className="flex-1">{state.message}</span>
        <button
          onClick={() => setDismissed(true)}
          className="p-0.5 rounded hover:bg-black/5 opacity-70"
          aria-label="关闭"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
