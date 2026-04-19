import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function AuthPage() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    setMsg(null)
    setLoading(true)
    const { error } =
      mode === 'signin' ? await signIn(email, password) : await signUp(email, password)
    setLoading(false)
    if (error) {
      setErr(error.message)
    } else if (mode === 'signup') {
      setMsg('注册邮件已发送，请查收邮箱确认。')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-main text-text">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold mb-6 text-center">Schedule</h1>

        <div className="flex gap-2 bg-card rounded-lg p-1 border border-border">
          <button
            type="button"
            onClick={() => setMode('signin')}
            className={`flex-1 py-2 rounded-md text-sm ${
              mode === 'signin' ? 'bg-accent text-white' : 'text-dim'
            }`}
          >
            登录
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`flex-1 py-2 rounded-md text-sm ${
              mode === 'signup' ? 'bg-accent text-white' : 'text-dim'
            }`}
          >
            注册
          </button>
        </div>

        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="邮箱"
          className="w-full px-4 py-3 rounded-lg bg-card border border-border text-text placeholder:text-muted focus:outline-none focus:border-accent"
        />
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="密码（至少 6 位）"
          className="w-full px-4 py-3 rounded-lg bg-card border border-border text-text placeholder:text-muted focus:outline-none focus:border-accent"
        />

        {err && <div className="text-sm text-red-500">{err}</div>}
        {msg && <div className="text-sm text-emerald-500">{msg}</div>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-lg bg-accent text-white font-medium disabled:opacity-60"
        >
          {loading ? '...' : mode === 'signin' ? '登录' : '注册'}
        </button>
      </form>
    </div>
  )
}
