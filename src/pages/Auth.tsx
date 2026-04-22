import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import PasswordInput from '../components/PasswordInput'
import TermsModal from '../components/TermsModal'

type Mode = 'signin' | 'signup' | 'forgot'

// Stash for the invite code entered at signup; redeemed on first SIGNED_IN.
// Lives in localStorage because signUp usually requires email confirmation,
// so the redeem step must happen in a later session.
export const PENDING_INVITE_CODE_KEY = 'pending_invite_code'

export default function AuthPage() {
  const { signIn, signUp, resetPassword } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [agreedTerms, setAgreedTerms] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const passwordMismatch =
    mode === 'signup' && confirmPassword.length > 0 && password !== confirmPassword

  const switchMode = (m: Mode) => {
    setMode(m)
    setErr(null)
    setMsg(null)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    setMsg(null)

    if (mode === 'forgot') {
      setLoading(true)
      const { error } = await resetPassword(email)
      setLoading(false)
      if (error) {
        const m = error.message.toLowerCase()
        if (m.includes('rate limit') || m.includes('too many')) {
          setErr('请求过于频繁，请稍后再试')
        } else {
          setErr('发送失败，请稍后再试')
        }
      } else {
        setMsg('重置邮件已发送，请查收邮箱')
      }
      return
    }

    if (password.length < 6) {
      setErr('密码至少 6 位')
      return
    }
    if (mode === 'signup' && password !== confirmPassword) {
      setErr('两次密码不一致')
      return
    }

    setLoading(true)
    if (mode === 'signin') {
      const { error } = await signIn(email, password)
      setLoading(false)
      if (error) {
        setErr(
          error.message.includes('Invalid login credentials')
            ? '邮箱或密码错误'
            : error.message,
        )
      }
    } else {
      // Stash invite code BEFORE signUp so the bootstrap handler can pick it
      // up once the user signs in (post-confirmation).
      const trimmed = inviteCode.trim()
      if (trimmed) {
        localStorage.setItem(PENDING_INVITE_CODE_KEY, trimmed)
      } else {
        localStorage.removeItem(PENDING_INVITE_CODE_KEY)
      }
      const { error } = await signUp(email, password)
      setLoading(false)
      if (error) {
        localStorage.removeItem(PENDING_INVITE_CODE_KEY)
        setErr(
          error.message.includes('already registered')
            ? '该邮箱已注册'
            : error.message,
        )
      } else {
        setMsg('注册邮件已发送，请查收邮箱确认。')
        setPassword('')
        setConfirmPassword('')
      }
    }
  }

  const inputClass =
    'w-full px-4 py-3 rounded-lg bg-card border border-border text-text placeholder:text-muted focus:outline-none focus:border-accent'

  const submitDisabled =
    loading ||
    (mode === 'signup' && (!agreedTerms || passwordMismatch))

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-main text-text">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-semibold">XMUM Schedule</h1>
          <p className="text-xs text-muted mt-1">AI 辅助课程日程管理</p>
        </div>

        <div className="rounded-lg border border-border bg-card px-4 py-3 text-xs text-dim leading-relaxed space-y-2">
          <p>
            把分散在 AC Online、Moodle、课件里的 <span className="text-text">课程 / 作业 / 考试 DDL</span> 集中到一个时间线里，自动去重、按周月日视图查看、到期前提醒。给 XMUM 学生自用的工具。
          </p>
          <p>
            配套 Chrome 扩展可一键抓取课程表与 Moodle DDL。
            <a
              href="/extensions.7z"
              download
              className="text-accent hover:underline ml-1"
            >
              下载扩展包 (.7z)
            </a>
          </p>
        </div>

        {mode !== 'forgot' && (
          <div className="flex gap-2 bg-card rounded-lg p-1 border border-border">
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className={`flex-1 py-2 rounded-md text-sm ${
                mode === 'signin' ? 'bg-accent text-white' : 'text-dim'
              }`}
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className={`flex-1 py-2 rounded-md text-sm ${
                mode === 'signup' ? 'bg-accent text-white' : 'text-dim'
              }`}
            >
              注册
            </button>
          </div>
        )}

        {mode === 'forgot' && (
          <div>
            <h2 className="text-base font-semibold">重置密码</h2>
            <p className="text-xs text-muted mt-1">
              输入注册邮箱，我们会发送重置链接
            </p>
          </div>
        )}

        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="邮箱"
          autoComplete="email"
          className={inputClass}
        />

        {mode !== 'forgot' && (
          <>
            <div>
              <PasswordInput
                value={password}
                onChange={setPassword}
                placeholder="密码（至少 6 位）"
                required
                minLength={6}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
              {mode === 'signin' && (
                <div className="flex justify-end mt-1.5">
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-xs text-dim hover:text-text transition-colors"
                  >
                    忘记密码？
                  </button>
                </div>
              )}
            </div>

            {mode === 'signup' && (
              <>
                <div>
                  <PasswordInput
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    placeholder="再次输入密码"
                    required
                    autoComplete="new-password"
                  />
                  {passwordMismatch && (
                    <div className="text-xs text-red-500 mt-1.5">两次密码不一致</div>
                  )}
                </div>

                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="邀请码（选填）"
                  className={inputClass}
                />

                <label className="flex items-start gap-2 text-xs text-dim cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreedTerms}
                    onChange={(e) => setAgreedTerms(e.target.checked)}
                    className="mt-0.5 accent-accent"
                  />
                  <span>
                    我已阅读并同意
                    <button
                      type="button"
                      onClick={() => setShowTerms(true)}
                      className="text-accent hover:underline mx-1"
                    >
                      《使用条款》
                    </button>
                  </span>
                </label>
              </>
            )}
          </>
        )}

        {err && <div className="text-sm text-red-500">{err}</div>}
        {msg && <div className="text-sm text-emerald-500">{msg}</div>}

        <button
          type="submit"
          disabled={submitDisabled}
          className="w-full py-3 rounded-lg bg-accent text-white font-medium disabled:opacity-60"
        >
          {loading
            ? '...'
            : mode === 'signin'
              ? '登录'
              : mode === 'signup'
                ? '注册'
                : '发送重置邮件'}
        </button>

        {mode === 'forgot' && (
          <button
            type="button"
            onClick={() => switchMode('signin')}
            className="w-full text-xs text-dim hover:text-text transition-colors"
          >
            返回登录
          </button>
        )}
      </form>

      {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
    </div>
  )
}
