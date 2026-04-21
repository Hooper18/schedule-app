import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import PasswordInput from '../components/PasswordInput'

export default function ResetPassword() {
  const { updatePassword, isRecoverySession } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    setMsg(null)
    if (password.length < 6) {
      setErr('密码至少 6 位')
      return
    }
    if (password !== confirmPassword) {
      setErr('两次密码不一致')
      return
    }
    setLoading(true)
    const { error } = await updatePassword(password)
    setLoading(false)
    if (error) {
      setErr(error.message)
      return
    }
    setMsg('密码已更新，即将跳转…')
    setTimeout(() => navigate('/', { replace: true }), 1200)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-main text-text">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-semibold">设置新密码</h1>
          <p className="text-xs text-muted mt-1">请输入你的新密码</p>
        </div>

        {!isRecoverySession && (
          <div className="text-sm text-amber-500">
            未检测到重置会话。请先通过邮件链接进入此页面。
          </div>
        )}

        <PasswordInput
          value={password}
          onChange={setPassword}
          placeholder="新密码（至少 6 位）"
          required
          minLength={6}
          autoComplete="new-password"
        />
        <PasswordInput
          value={confirmPassword}
          onChange={setConfirmPassword}
          placeholder="再次输入新密码"
          required
          autoComplete="new-password"
        />

        {err && <div className="text-sm text-red-500">{err}</div>}
        {msg && <div className="text-sm text-emerald-500">{msg}</div>}

        <button
          type="submit"
          disabled={loading || !isRecoverySession}
          className="w-full py-3 rounded-lg bg-accent text-white font-medium disabled:opacity-60"
        >
          {loading ? '...' : '更新密码'}
        </button>
      </form>
    </div>
  )
}
