import { useMemo } from 'react'
import type { Course, Event, EventStatus, EventType, Semester } from '../../lib/types'
import { getDaysUntil, parseDate, todayISO, weekNumber } from '../../lib/utils'
import EventCard from '../shared/EventCard'

interface Props {
  selectedDate: string
  events: Event[]
  courseMap: Record<string, Course>
  semester: Semester
  onToggle: (id: string, status: EventStatus) => void
  onEdit: (e: Event) => void
  onSelectDate?: (iso: string) => void
}

// Desktop-only right rail: selected-day event list on top, next 8 upcoming
// events below the divider. Hidden below md — the mobile path keeps using
// the in-page event list under the month grid.
export default function DayDetailPanel({
  selectedDate,
  events,
  courseMap,
  semester,
  onToggle,
  onEdit,
  onSelectDate,
}: Props) {
  const selectedDayEvents = useMemo(
    () => events.filter((e) => e.date === selectedDate),
    [events, selectedDate],
  )

  const upcoming = useMemo(() => {
    const today = todayISO()
    return events
      .filter((e) => e.date !== null && e.date >= today)
      .slice()
      .sort((a, b) => {
        if (a.date === b.date) {
          return (a.time ?? '').localeCompare(b.time ?? '')
        }
        return (a.date ?? '').localeCompare(b.date ?? '')
      })
      .slice(0, 8)
  }, [events])

  const wk = weekNumber(selectedDate, semester)
  const d = parseDate(selectedDate)
  const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  const headerLabel = `${d.getMonth() + 1}月${d.getDate()}日 ${wd}`

  return (
    <aside className="hidden md:flex md:flex-col md:w-64 md:border-l md:border-border md:bg-card/40">
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-4 space-y-4">
        {/* Selected day */}
        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-text truncate">
              {headerLabel}
            </h3>
            {wk !== null && (
              <span className="text-[11px] text-dim shrink-0">Week {wk}</span>
            )}
          </div>
          {selectedDayEvents.length === 0 ? (
            <div className="text-xs text-dim py-6 text-center bg-card rounded-lg border border-border">
              今日暂无事件
            </div>
          ) : (
            <div className="space-y-2">
              {selectedDayEvents.map((e) => (
                <EventCard
                  key={e.id}
                  event={e}
                  course={e.course_id ? courseMap[e.course_id] : undefined}
                  semester={semester}
                  onToggle={onToggle}
                  onEdit={onEdit}
                />
              ))}
            </div>
          )}
        </section>

        <div className="border-t border-border" />

        {/* Upcoming */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold tracking-wider text-muted uppercase">
              即将到来
            </h3>
            {upcoming.length > 0 && (
              <span className="text-[10px] text-muted">{upcoming.length}</span>
            )}
          </div>
          {upcoming.length === 0 ? (
            <div className="text-xs text-dim py-4 text-center">暂无计划</div>
          ) : (
            <ul className="space-y-1.5">
              {upcoming.map((e) => {
                const course = e.course_id ? courseMap[e.course_id] : null
                const days = getDaysUntil(e.date)
                const daysLabel = days === null ? '' : days === 0 ? '今天' : `${days}d`
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => e.date && onSelectDate?.(e.date)}
                      className="w-full flex items-center gap-2 py-1.5 px-1 rounded hover:bg-hover text-left"
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: dotColor(e.type, course?.color) }}
                      />
                      <span className="flex-1 min-w-0 text-xs text-text truncate">
                        {e.title}
                        {course ? ` · ${course.code}` : ''}
                      </span>
                      <span className="text-[10px] text-dim shrink-0">
                        {daysLabel}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </aside>
  )
}

// Dot palette mirrors the grid pill colors (roughly). Falls back to the
// course color if we have one and the type is the generic "gray" bucket.
function dotColor(type: EventType, courseColor: string | undefined): string {
  switch (type) {
    case 'exam':
      return '#ef4444'
    case 'midterm':
      return '#ec4899'
    case 'quiz':
      return '#f59e0b'
    case 'deadline':
    case 'lab_report':
      return '#3b82f6'
    case 'video_submission':
    case 'presentation':
      return '#a855f7'
    case 'holiday':
      return '#10b981'
    default:
      return courseColor ?? '#6b7280'
  }
}
