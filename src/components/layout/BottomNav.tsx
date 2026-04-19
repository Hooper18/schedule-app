import { NavLink } from 'react-router-dom'
import { Clock, Calendar, BookOpen, Plus } from 'lucide-react'

const items = [
  { to: '/', label: 'Timeline', Icon: Clock, end: true },
  { to: '/calendar', label: 'Calendar', Icon: Calendar },
  { to: '/courses', label: 'Courses', Icon: BookOpen },
  { to: '/import', label: 'Add', Icon: Plus },
]

export default function BottomNav() {
  return (
    <nav className="safe-bottom fixed bottom-0 inset-x-0 z-20 bg-main/95 backdrop-blur border-t border-border">
      <div className="grid grid-cols-4 h-14">
        {items.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 text-xs transition-colors ${
                isActive ? 'text-accent' : 'text-muted'
              }`
            }
          >
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
