import { NavLink } from 'react-router-dom'
import {
  Clock,
  Calendar,
  BookOpen,
  Plus,
  Settings,
  CalendarRange,
} from 'lucide-react'

// Desktop-only left rail. Mirrors BottomNav's route list so either surface
// navigates the same way. Settings is rendered disabled for now — no route
// yet, kept as a visual anchor at the bottom.
const items: Array<{
  to: string
  label: string
  Icon: typeof Clock
  end?: boolean
}> = [
  { to: '/', label: 'Timeline', Icon: Clock, end: true },
  { to: '/calendar', label: 'Calendar', Icon: Calendar },
  { to: '/courses', label: 'Courses', Icon: BookOpen },
  { to: '/academic', label: '校历', Icon: CalendarRange },
  { to: '/import', label: 'Add', Icon: Plus },
]

export default function DesktopSidebar() {
  return (
    <aside className="hidden md:flex md:flex-col md:w-16 md:shrink-0 border-r border-border bg-card">
      <nav className="flex-1 flex flex-col items-stretch gap-1 py-3 px-2">
        {items.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-[10px] font-medium transition-colors ${
                isActive
                  ? 'bg-accent/15 text-accent'
                  : 'text-dim hover:bg-hover hover:text-text'
              }`
            }
          >
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="px-2 pb-3">
        <button
          type="button"
          disabled
          title="暂未开放"
          className="w-full flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-[10px] font-medium text-muted/60 cursor-not-allowed"
        >
          <Settings size={18} />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  )
}
