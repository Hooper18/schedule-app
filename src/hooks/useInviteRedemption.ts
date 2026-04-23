import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { PENDING_INVITE_CODE_KEY } from '../pages/Auth'

type State =
  | null
  | { status: 'success'; message: string }
  | { status: 'failed'; message: string }

// Redeems a pending invite code once per authenticated session. The code is
// written to localStorage at signup time (see Auth.tsx) because signUp
// usually requires email confirmation — the actual user session only exists
// on the next page load after the user clicks the confirm link.
export function useInviteRedemption(onRedeemed?: () => void) {
  const { user } = useAuth()
  const [state, setState] = useState<State>(null)
  const triedRef = useRef(false)

  useEffect(() => {
    if (!user || triedRef.current) return
    const code = localStorage.getItem(PENDING_INVITE_CODE_KEY)
    if (!code) return
    triedRef.current = true

    ;(async () => {
      const { error } = await supabase.rpc('redeem_invite_code', {
        p_code: code,
      })
      if (error) {
        // "invalid or used code" is terminal — clear so we don't retry forever.
        // Other errors (network, RLS hiccups) leave the code in place so a
        // later session can retry.
        if (error.message.includes('invalid or used code')) {
          localStorage.removeItem(PENDING_INVITE_CODE_KEY)
          setState({ status: 'failed', message: '邀请码无效或已被使用' })
        } else {
          console.warn('[invite] redemption transient error', error)
          setState({ status: 'failed', message: error.message })
        }
        return
      }
      localStorage.removeItem(PENDING_INVITE_CODE_KEY)
      setState({
        status: 'success',
        message: '邀请码已激活，获得 $1.00 新用户福利',
      })
      onRedeemed?.()
    })()
  }, [user, onRedeemed])

  return state
}
