import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'
import UserMenu from './UserMenu'

interface Props {
  title: string
  right?: React.ReactNode
  showBack?: boolean
  onBack?: () => void
}

export default function Header({ title, right, showBack, onBack }: Props) {
  const navigate = useNavigate()
  const handleBack = () => {
    if (onBack) onBack()
    else navigate(-1)
  }

  return (
    <header className="safe-top sticky top-0 z-20 bg-main/90 backdrop-blur border-b border-border">
      <div className="h-14 px-2 flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 min-w-0">
          {showBack && (
            <button
              onClick={handleBack}
              className="p-2 rounded-lg hover:bg-hover text-dim transition-colors"
              aria-label="返回"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <h1 className="text-lg font-semibold text-text truncate px-2">
            {title}
          </h1>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {right}
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  )
}
