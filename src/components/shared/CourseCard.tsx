import { ChevronRight } from 'lucide-react'
import type { Course } from '../../lib/types'
import { formatShortDate, getDaysUntil } from '../../lib/utils'

interface Props {
  course: Course
  pendingCount: number
  nextDeadline?: { title: string; date: string | null } | null
  onClick: () => void
}

export default function CourseCard({ course, pendingCount, nextDeadline, onClick }: Props) {
  const days = getDaysUntil(nextDeadline?.date)
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 rounded-xl bg-card border border-border hover:bg-hover transition-colors flex gap-3 items-start"
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0"
        style={{ backgroundColor: course.color }}
      >
        {course.code}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text truncate">{course.name}</div>
        {course.lecturer && (
          <div className="text-xs text-dim truncate">{course.lecturer}</div>
        )}
        <div className="mt-2 flex items-center gap-2 text-xs flex-wrap">
          <span
            className={`px-1.5 py-0.5 rounded ${
              pendingCount > 0
                ? 'bg-amber-500/15 text-amber-500'
                : 'bg-hover text-muted'
            }`}
          >
            {pendingCount} pending
          </span>
          {nextDeadline?.date && (
            <span className="text-dim truncate">
              下个 · {formatShortDate(nextDeadline.date)}
              {days !== null && days >= 0 && ` (${days}d)`}
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={18} className="text-muted shrink-0 mt-1" />
    </button>
  )
}
