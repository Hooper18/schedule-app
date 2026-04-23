import { NavLink } from 'react-router-dom'
import { Home, ListChecks, Calendar, Plus } from 'lucide-react'

// Bottom navigation for mobile. 课表 is intentionally NOT here — the Home
// page surfaces "今日课程" + a "查看完整课表" shortcut, which covers the
// in-situ use cases without burning a permanent nav slot.
const items = [
  { to: '/', label: '首页', Icon: Home, end: true },
  { to: '/todo', label: '待办', Icon: ListChecks },
  { to: '/calendar', label: '日历', Icon: Calendar },
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
