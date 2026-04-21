import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

type Props = {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoComplete?: string
  required?: boolean
  disabled?: boolean
  minLength?: number
}

export default function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
  required,
  disabled,
  minLength,
}: Props) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        minLength={minLength}
        className="w-full px-4 py-3 pr-10 rounded-lg bg-card border border-border text-text placeholder:text-muted focus:outline-none focus:border-accent disabled:opacity-60"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={show ? '隐藏密码' : '显示密码'}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-muted hover:text-text transition-colors"
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}
