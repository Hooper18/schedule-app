import { useEffect, useRef, useState } from 'react'
import { CalendarDays, Sparkles, Chrome, Download, MailCheck, Loader2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import PasswordInput from '../components/PasswordInput'
import TermsModal from '../components/TermsModal'

type Mode = 'signin' | 'signup' | 'forgot'

// How often we retry signInWithPassword while waiting for the user to click
// the confirmation email on another device, and how long we keep trying before
// giving up and asking them to log in manually.
const POLL_INTERVAL_MS = 4000
const POLL_TIMEOUT_MS = 10 * 60 * 1000

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
  // When set, the UI switches to a "waiting for email confirmation" panel and
  // a background poll tries to sign in until the user clicks the email link
  // (possibly on another device).
  const [pendingConfirmation, setPendingConfirmation] = useState<
    { email: string; password: string } | null
  >(null)
  const [pollTimedOut, setPollTimedOut] = useState(false)
  // Latest credentials/flag, read by the async poll loop so React state stays
  // in sync even across renders without retriggering the effect.
  const pollRef = useRef<{ cancelled: boolean }>({ cancelled: false })

  const passwordMismatch =
    mode === 'signup' && confirmPassword.length > 0 && password !== confirmPassword

  const switchMode = (m: Mode) => {
    setMode(m)
    setErr(null)
    setMsg(null)
  }

  // Poll signInWithPassword while we're waiting for email confirmation. Once
  // the user clicks the link on any device, the email is marked confirmed and
  // the next poll succeeds — onAuthStateChange then navigates away from /auth.
  useEffect(() => {
    if (!pendingConfirmation) return
    pollRef.current = { cancelled: false }
    const ref = pollRef.current
    const startedAt = Date.now()
    let timerId: number | undefined

    const tick = async () => {
      if (ref.cancelled) return
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        setPollTimedOut(true)
        return
      }
      const { error } = await supabase.auth.signInWithPassword({
        email: pendingConfirmation.email,
        password: pendingConfirmation.password,
      })
      if (ref.cancelled) return
      if (!error) {
        // Success — AuthContext's onAuthStateChange fires SIGNED_IN, which
        // flips AppRoutes away from /auth. No explicit navigate needed.
        return
      }
      timerId = window.setTimeout(tick, POLL_INTERVAL_MS)
    }

    timerId = window.setTimeout(tick, POLL_INTERVAL_MS)

    return () => {
      ref.cancelled = true
      if (timerId !== undefined) window.clearTimeout(timerId)
    }
  }, [pendingConfirmation])

  const cancelPendingConfirmation = () => {
    setPendingConfirmation(null)
    setPollTimedOut(false)
    setMode('signin')
    setPassword('')
    setConfirmPassword('')
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
        // Hold credentials in component state (not persisted) so the poll
        // below can sign in automatically the moment the email is confirmed
        // — even if the user clicks the link on a different device.
        setPendingConfirmation({ email, password })
      }
    }
  }

  const inputClass =
    'w-full px-4 py-3 rounded-lg bg-card border border-border text-text placeholder:text-muted focus:outline-none focus:border-accent'

  const submitDisabled =
    loading ||
    (mode === 'signup' && (!agreedTerms || passwordMismatch))

  return (
    <div className="min-h-screen bg-main text-text md:grid md:grid-cols-2">
      {/* Left brand panel — desktop only */}
      <aside className="hidden md:flex relative overflow-hidden items-center justify-center p-12 bg-gradient-to-br from-accent/15 via-accent/5 to-transparent border-r border-border">
        <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-accent/10 blur-3xl" aria-hidden />
        <div className="absolute -bottom-32 -right-20 w-80 h-80 rounded-full bg-accent/10 blur-3xl" aria-hidden />

        <div className="relative max-w-md space-y-8">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center">
              <CalendarDays className="text-accent" size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">XMUM Schedule</h1>
              <p className="text-xs text-muted mt-0.5">AI 辅助课程日程管理</p>
            </div>
          </div>

          <p className="text-sm text-dim leading-relaxed">
            把分散在 <span className="text-text">AC Online</span>、<span className="text-text">Moodle</span>、课件里的课程 / 作业 / 考试 DDL 集中到一个时间线里，自动去重、按周月日视图查看、到期前提醒。给 XMUM 学生自用的工具。
          </p>

          <ul className="space-y-3 text-sm">
            <li className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center shrink-0">
                <Sparkles size={14} className="text-accent" />
              </div>
              <div>
                <div className="font-medium text-text">AI 识别 DDL</div>
                <div className="text-xs text-dim mt-0.5">上传课件或粘贴课程表，自动提取截止日期</div>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center shrink-0">
                <CalendarDays size={14} className="text-accent" />
              </div>
              <div>
                <div className="font-medium text-text">学期 / 周 / 月视图</div>
                <div className="text-xs text-dim mt-0.5">按学期周次展示课程，配套校历公假与复习周</div>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center shrink-0">
                <Chrome size={14} className="text-accent" />
              </div>
              <div>
                <div className="font-medium text-text">一键浏览器扩展</div>
                <div className="text-xs text-dim mt-0.5">Chrome 插件直接抓取课程表与 Moodle DDL</div>
              </div>
            </li>
          </ul>

          <a
            href="/extensions.7z"
            download
            className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
          >
            <Download size={12} /> 下载 Chrome 扩展包 (.7z)
          </a>
        </div>
      </aside>

      {/* Form panel */}
      <div className="flex items-center justify-center px-6 py-10 md:py-12">
        {pendingConfirmation ? (
          <div className="w-full max-w-sm md:bg-card md:border md:border-border md:rounded-2xl md:shadow-sm md:p-8 space-y-5">
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center">
                <MailCheck className="text-accent" size={26} />
              </div>
              <h2 className="text-lg font-semibold">等待邮箱确认</h2>
              <p className="text-xs text-dim leading-relaxed">
                确认邮件已发送至
                <span className="block mt-1 text-text break-all font-medium">
                  {pendingConfirmation.email}
                </span>
              </p>
            </div>

            <div className="rounded-lg border border-border bg-card px-4 py-3 text-xs text-dim leading-relaxed space-y-1.5">
              <p>
                请查收邮箱并点击确认链接，
                <span className="text-text">确认后本页面会自动登录</span>
                ，无需返回此处输入密码。
              </p>
              <p>支持在任意设备点击（包括手机）。</p>
            </div>

            {!pollTimedOut ? (
              <div className="flex items-center justify-center gap-2 text-xs text-dim">
                <Loader2 size={14} className="animate-spin" />
                正在等待确认…
              </div>
            ) : (
              <div className="text-xs text-red-500 text-center leading-relaxed">
                等待超时。如已确认，请手动返回登录。
              </div>
            )}

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={cancelPendingConfirmation}
                className="w-full py-2.5 rounded-lg border border-border text-sm text-text hover:bg-hover transition-colors"
              >
                返回登录
              </button>
              <p className="text-[10px] text-muted text-center leading-relaxed">
                没收到邮件？检查垃圾邮件箱，或返回登录后用「忘记密码」重新触发验证。
              </p>
            </div>
          </div>
        ) : (
        <form
          onSubmit={submit}
          className="w-full max-w-sm space-y-4 md:bg-card md:border md:border-border md:rounded-2xl md:shadow-sm md:p-8"
        >
          <div className="text-center mb-2 md:mb-4">
            <h1 className="text-2xl font-semibold md:hidden">XMUM Schedule</h1>
            <p className="text-xs text-muted mt-1 md:hidden">AI 辅助课程日程管理</p>
            <h2 className="hidden md:block text-lg font-semibold">
              {mode === 'signin' ? '欢迎回来' : mode === 'signup' ? '创建账户' : '重置密码'}
            </h2>
            <p className="hidden md:block text-xs text-muted mt-1">
              {mode === 'signin'
                ? '继续管理你的课程与 DDL'
                : mode === 'signup'
                  ? '仅需邮箱即可开始使用'
                  : '输入注册邮箱以接收重置链接'}
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card px-4 py-3 text-xs text-dim leading-relaxed space-y-2 md:hidden">
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

        {mode === 'signin' && (
          <p className="text-xs text-dim text-center leading-relaxed">
            登录即表示你已阅读并同意
            <button
              type="button"
              onClick={() => setShowTerms(true)}
              className="text-accent hover:underline mx-1"
            >
              《使用条款》
            </button>
          </p>
        )}

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
        )}
      </div>

      {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
    </div>
  )
}
