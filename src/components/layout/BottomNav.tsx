import { NavLink } from 'react-router-dom'
import { ListChecks, Calendar, LayoutGrid, Plus } from 'lucide-react'

const items = [
  { to: '/', label: '待办', Icon: ListChecks, end: true },
  { to: '/calendar', label: '日历', Icon: Calendar },
  { to: '/timetable', label: '课表', Icon: LayoutGrid },
  { to: '/import', label: '添加', Icon: Plus },
]

export default function BottomNav() {
  return (
    <nav className="safe-bottom fixed bottom-0 inset-x-0 z-20 bg-main/95 backdrop-blur border-t border-border md:hidden">
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
