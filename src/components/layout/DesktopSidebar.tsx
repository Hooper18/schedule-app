import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Home,
  ListChecks,
  Calendar,
  Plus,
  Settings,
  HelpCircle,
} from 'lucide-react'
import HelpModal from '../HelpModal'

// Desktop-only left rail. Mirrors BottomNav's route list so either surface
// navigates the same way. 课表 is intentionally off — Home surfaces
// today's classes + a "view full timetable" shortcut. Settings is rendered
// disabled for now; no route yet, kept as a visual anchor.
const items: Array<{
  to: string
  label: string
  Icon: typeof ListChecks
  end?: boolean
}> = [
  { to: '/', label: '首页', Icon: Home, end: true },
  { to: '/todo', label: '待办', Icon: ListChecks },
  { to: '/calendar', label: '日历', Icon: Calendar },
  { to: '/import', label: '添加', Icon: Plus },
]

export default function DesktopSidebar() {
  const [helpOpen, setHelpOpen] = useState(false)

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
      <div className="px-2 pb-3 flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="w-full flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-[10px] font-medium text-dim hover:bg-hover hover:text-text transition-colors"
        >
          <HelpCircle size={18} />
          <span>Help</span>
        </button>
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
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </aside>
  )
}
