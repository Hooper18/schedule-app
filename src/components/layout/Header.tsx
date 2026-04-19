import { LogOut } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import ThemeToggle from './ThemeToggle'

interface Props {
  title: string
  right?: React.ReactNode
}

export default function Header({ title, right }: Props) {
  const { signOut } = useAuth()
  return (
    <header className="safe-top sticky top-0 z-20 bg-main/90 backdrop-blur border-b border-border">
      <div className="h-14 px-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text">{title}</h1>
        <div className="flex items-center gap-1">
          {right}
          <ThemeToggle />
          <button
            onClick={signOut}
            className="p-2 rounded-lg hover:bg-hover text-dim transition-colors"
            aria-label="退出登录"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  )
}
