import { Fragment, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useSemester } from '../../hooks/useSemester'
import { useCourses } from '../../hooks/useCourses'
import { useEvents } from '../../hooks/useEvents'
import EventCard from '../shared/EventCard'
import EventModal from '../shared/EventModal'
import DayDetailPanel from './DayDetailPanel'
import type { Event, Course, WeeklySchedule, EventType } from '../../lib/types'
import {
  addMonths,
  isoOf,
  parseDate,
  startOfMonth,
  weekNumber,
} from '../../lib/utils'
import { weekLabel } from '../../constants/semester'

type Mode = 'month' | 'day'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

// Desktop pill palette — soft light bg + dark text, with dark-mode variants.
// Distinct from the existing solid-color badge classes (typeColor) so we can
// keep the month grid visually calm while still telling types apart.
function eventPillClass(type: EventType): string {
  switch (type) {
    case 'exam':
      return 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200'
    case 'midterm':
      return 'bg-pink-50 text-pink-800 dark:bg-pink-900/30 dark:text-pink-200'
    case 'quiz':
      return 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
    case 'deadline':
    case 'lab_report':
      return 'bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
    case 'video_submission':
    case 'presentation':
      return 'bg-purple-50 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200'
    case 'holiday':
      return 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200'
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300'
  }
}

export default function CalendarView() {
  const navigate = useNavigate()
  const { semester } = useSemester()
  const { courses, schedule } = useCourses(semester?.id)
  const { events, setStatus, reload } = useEvents(semester?.id)

  const [cursor, setCursor] = useState<Date>(startOfMonth(new Date()))
  const [selected, setSelected] = useState<string>(isoOf(new Date()))
  const [mode, setMode] = useState<Mode>('month')
  const [editing, setEditing] = useState<Event | null>(null)

  const courseMap = useMemo(
    () => Object.fromEntries(courses.map((c) => [c.id, c])),
    [courses],
  )

  const eventsByDate = useMemo(() => {
    const m = new Map<string, Event[]>()
    for (const e of events) {
      if (!e.date) continue
      const arr = m.get(e.date) ?? []
      arr.push(e)
      m.set(e.date, arr)
    }
    return m
  }, [events])

  const grid = useMemo(() => buildMonthGrid(cursor), [cursor])

  const selectedEvents = eventsByDate.get(selected) ?? []
  const selectedDayOfWeek = parseDate(selected).getDay()
  const daySchedule = schedule
    .filter((s) => s.day_of_week === selectedDayOfWeek)
    .slice()
    .sort((a, b) => a.start_time.localeCompare(b.start_time))

  if (!semester) {
    return (
      <div className="p-8 text-center text-dim">
        <p>尚未创建学期。</p>
      </div>
    )
  }

  const monthLabel = `${cursor.getFullYear()}.${String(cursor.getMonth() + 1).padStart(2, '0')}`

  const goToToday = () => {
    const today = new Date()
    setCursor(startOfMonth(today))
    setSelected(isoOf(today))
  }

  if (mode === 'day') {
    return (
      <div className="h-full overflow-y-auto no-scrollbar">
        <DayView
          date={selected}
          events={selectedEvents}
          courseMap={courseMap}
          semester={semester}
          schedule={daySchedule}
          onToggle={setStatus}
          onEdit={setEditing}
          onPrevDay={() => setSelected((iso) => shiftDate(iso, -1))}
          onNextDay={() => setSelected((iso) => shiftDate(iso, 1))}
          onBackToMonth={() => setMode('month')}
        />
        <EventModal
          event={editing}
          courses={courses}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col md:flex-row">
      {/* Left column: top bar, month grid, and (mobile only) event list */}
      <div className="flex-1 flex flex-col min-w-0">
      {/* Month controls + view toggle — fixed (does NOT scroll) */}
      <div className="shrink-0 bg-main border-b border-border">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCursor((c) => addMonths(c, -1))}
              className="p-1.5 rounded hover:bg-hover text-dim"
              aria-label="上个月"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="font-semibold text-text text-lg min-w-[5rem] text-center">
              {monthLabel}
            </span>
            <button
              onClick={() => setCursor((c) => addMonths(c, 1))}
              className="p-1.5 rounded hover:bg-hover text-dim"
              aria-label="下个月"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            {/* Desktop-only view switcher */}
            <div className="hidden md:flex bg-card rounded-full p-1 border border-border">
              <button
                type="button"
                className="px-3 py-1 rounded-full text-xs font-medium bg-main text-text shadow-sm"
              >
                月
              </button>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="px-3 py-1 rounded-full text-xs font-medium text-dim hover:text-text"
              >
                日程
              </button>
            </div>
            <button
              type="button"
              onClick={goToToday}
              className="text-xs font-medium px-3 py-1 rounded-full border border-accent text-accent hover:bg-accent/10 transition-colors"
            >
              Today
            </button>
          </div>
        </div>
        <MonthGrid
          grid={grid}
          cursor={cursor}
          selected={selected}
          semester={semester}
          eventsByDate={eventsByDate}
          courseMap={courseMap}
          onSelect={setSelected}
        />
      </div>

      {/* Events for selected day — scrolls independently, no visible
          scrollbar. Hidden on desktop; DayDetailPanel on the right handles
          the same content there. */}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-4 space-y-3 pb-24 md:hidden">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-text">
              {formatSelectedLabel(selected)}
            </div>
            <div className="text-xs text-dim">
              {selectedEvents.length === 0
                ? '无事件'
                : `${selectedEvents.length} 条事件`}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMode('day')}
            className="text-xs text-accent hover:underline flex items-center gap-1"
          >
            查看日视图 <ArrowRight size={12} />
          </button>
        </div>

        {selectedEvents.length === 0 ? (
          <div className="text-sm text-dim py-8 text-center bg-card rounded-xl border border-border">
            无事件
          </div>
        ) : (
          <div className="space-y-2">
            {selectedEvents.map((e) => (
              <EventCard
                key={e.id}
                event={e}
                course={e.course_id ? courseMap[e.course_id] : undefined}
                semester={semester}
                onToggle={setStatus}
                onEdit={setEditing}
              />
            ))}
          </div>
        )}
      </div>

      </div>
      {/* Right detail panel — desktop only */}
      <DayDetailPanel
        selectedDate={selected}
        events={events}
        courseMap={courseMap}
        semester={semester}
        onToggle={setStatus}
        onEdit={setEditing}
        onSelectDate={setSelected}
      />

      <EventModal
        event={editing}
        courses={courses}
        onClose={() => setEditing(null)}
        onSaved={reload}
      />
    </div>
  )
}

function shiftDate(iso: string, delta: number): string {
  const d = parseDate(iso)
  d.setDate(d.getDate() + delta)
  return isoOf(d)
}

function formatSelectedLabel(iso: string): string {
  const d = parseDate(iso)
  const wd = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  const today = isoOf(new Date())
  const suffix = iso === today ? ' · 今天' : ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} 周${wd}${suffix}`
}

function buildMonthGrid(cursor: Date): Date[] {
  const first = startOfMonth(cursor)
  const startWeekday = first.getDay()
  const gridStart = new Date(first)
  gridStart.setDate(1 - startWeekday)
  const cells: Date[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    cells.push(d)
  }
  return cells
}

interface MonthProps {
  grid: Date[]
  cursor: Date
  selected: string
  semester: {
    exam_start: string | null
    exam_end: string | null
    revision_start: string | null
    end_date: string
  }
  eventsByDate: Map<string, Event[]>
  courseMap: Record<string, Course>
  onSelect: (iso: string) => void
}

function MonthGrid({
  grid,
  cursor,
  selected,
  semester,
  eventsByDate,
  courseMap,
  onSelect,
}: MonthProps) {
  const todayIso = isoOf(new Date())
  // 6 weeks * 7 days = 42; split into rows for the desktop week-label column.
  const rows: Date[][] = []
  for (let i = 0; i < 6; i++) rows.push(grid.slice(i * 7, i * 7 + 7))

  return (
    <div className="p-2">
      {/* Weekday header. Desktop has an extra spacer cell to align with the
          week-label column; mobile uses a plain 7-col grid. */}
      <div className="grid grid-cols-7 md:grid-cols-[36px_repeat(7,1fr)] text-center text-[11px] font-medium text-muted py-2">
        <div className="hidden md:block" />
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={i === 0 ? 'text-red-500' : ''}>
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 md:grid-cols-[36px_repeat(7,1fr)] gap-0.5">
        {rows.map((row, rowIdx) => (
          <Fragment key={rowIdx}>
            {/* Desktop-only week label column. The label comes from the
                Sunday cell of the row so it lines up with the left edge. */}
            <div className="hidden md:flex items-center justify-center text-[10px] font-semibold text-muted">
              {weekLabel(isoOf(row[0]))}
            </div>
            {row.map((d) => (
              <Cell
                key={isoOf(d)}
                d={d}
                cursor={cursor}
                selected={selected}
                todayIso={todayIso}
                semester={semester}
                eventsByDate={eventsByDate}
                courseMap={courseMap}
                onSelect={onSelect}
              />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

interface CellProps {
  d: Date
  cursor: Date
  selected: string
  todayIso: string
  semester: MonthProps['semester']
  eventsByDate: Map<string, Event[]>
  courseMap: Record<string, Course>
  onSelect: (iso: string) => void
}

function Cell({
  d,
  cursor,
  selected,
  todayIso,
  semester,
  eventsByDate,
  courseMap,
  onSelect,
}: CellProps) {
  const iso = isoOf(d)
  const inMonth = d.getMonth() === cursor.getMonth()
  const isToday = iso === todayIso
  const isSelected = iso === selected
  const dayEvents = eventsByDate.get(iso) ?? []
  const isExamWeek =
    semester.exam_start &&
    semester.exam_end &&
    iso >= semester.exam_start &&
    iso <= semester.exam_end
  const isRevisionWeek =
    semester.revision_start &&
    semester.exam_start &&
    iso >= semester.revision_start &&
    iso < semester.exam_start
  const isSunday = d.getDay() === 0
  const hasHoliday = dayEvents.some((e) => e.type === 'holiday')

  const seasonBg = isExamWeek
    ? 'bg-red-500/10'
    : isRevisionWeek
      ? 'bg-amber-500/10'
      : 'bg-card'

  const bg = isSelected ? 'bg-accent/20' : inMonth ? seasonBg : 'bg-card'
  const border = isSelected
    ? 'border-accent'
    : isToday
      ? 'border-accent/60 md:border-transparent'
      : 'border-transparent'

  // Mobile dots (small colored dots under the date number).
  const dots = dayEvents.slice(0, 4).map((e) => {
    if (e.type === 'holiday') return '#10b981'
    if (e.course_id && courseMap[e.course_id]) return courseMap[e.course_id].color
    return '#6b7280'
  })

  // Desktop pills (max 3 visible + "+N more"). We keep this separate from
  // the mobile dot logic so each surface renders its own markup.
  const visiblePills = dayEvents.slice(0, 3)
  const hiddenCount = Math.max(0, dayEvents.length - visiblePills.length)

  // Inline "today" treatment on desktop: a small filled circle behind the
  // date number. Mobile still uses the border-accent ring (unchanged).
  const dateCircleClass = isToday
    ? 'md:bg-accent md:text-white md:w-6 md:h-6 md:flex md:items-center md:justify-center md:rounded-full md:text-xs md:font-semibold'
    : ''

  const dateTextColor = hasHoliday
    ? 'text-emerald-500 font-semibold'
    : isSunday && inMonth
      ? 'text-red-500'
      : inMonth
        ? 'text-text'
        : 'text-muted'

  return (
    <button
      onClick={() => onSelect(iso)}
      className={`aspect-square md:aspect-auto md:h-24 rounded-lg p-1 md:p-1.5 flex flex-col items-center md:items-stretch justify-start border transition-colors ${border} ${bg} ${inMonth ? '' : 'opacity-40'} hover:bg-hover text-left`}
    >
      <span
        className={`text-xs md:text-[13px] ${dateTextColor} ${dateCircleClass} md:self-start`}
      >
        {d.getDate()}
      </span>

      {/* Mobile dot row */}
      {dots.length > 0 && (
        <div className="flex gap-0.5 mt-auto pb-0.5 md:hidden">
          {dots.map((c, i) => (
            <span
              key={i}
              className="w-1 h-1 rounded-full"
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      )}

      {/* Desktop pill stack */}
      {visiblePills.length > 0 && (
        <div className="hidden md:flex md:flex-col md:gap-0.5 md:mt-1 md:w-full">
          {visiblePills.map((e) => {
            const course = e.course_id ? courseMap[e.course_id] : null
            const suffix = course ? ` · ${course.code}` : ''
            return (
              <span
                key={e.id}
                className={`text-[11px] leading-tight px-1 py-px rounded truncate ${eventPillClass(e.type)}`}
                title={`${e.title}${suffix}`}
              >
                {e.title}
                {suffix}
              </span>
            )
          })}
          {hiddenCount > 0 && (
            <span className="text-[10px] text-muted pl-1">
              +{hiddenCount} more
            </span>
          )}
        </div>
      )}
    </button>
  )
}

interface DayProps {
  date: string
  events: Event[]
  courseMap: Record<string, Course>
  semester: Parameters<typeof weekNumber>[1]
  schedule: WeeklySchedule[]
  onToggle: (id: string, status: 'pending' | 'completed') => void
  onEdit: (event: Event) => void
  onPrevDay: () => void
  onNextDay: () => void
  onBackToMonth: () => void
}

function DayView({
  date,
  events,
  courseMap,
  semester,
  schedule,
  onToggle,
  onEdit,
  onPrevDay,
  onNextDay,
  onBackToMonth,
}: DayProps) {
  const d = parseDate(date)
  const wk = weekNumber(date, semester)
  const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')} ${['日', '一', '二', '三', '四', '五', '六'][d.getDay()]}`
  return (
    <div className="p-4 space-y-4">
      <button
        type="button"
        onClick={onBackToMonth}
        className="text-xs text-dim hover:text-accent flex items-center gap-1"
      >
        <ArrowLeft size={12} /> 返回月视图
      </button>

      <div className="flex items-center justify-between">
        <button onClick={onPrevDay} className="p-1.5 rounded hover:bg-hover text-dim">
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <div className="font-semibold text-text">{label}</div>
          {wk !== null && <div className="text-xs text-dim">Week {wk}</div>}
        </div>
        <button onClick={onNextDay} className="p-1.5 rounded hover:bg-hover text-dim">
          <ChevronRight size={18} />
        </button>
      </div>

      <section>
        <h3 className="text-xs font-semibold tracking-wider text-muted uppercase mb-2">
          Events ({events.length})
        </h3>
        {events.length === 0 ? (
          <div className="text-sm text-dim py-4 text-center bg-card rounded-lg border border-border">
            今日无事件
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((e) => (
              <EventCard
                key={e.id}
                event={e}
                course={e.course_id ? courseMap[e.course_id] : undefined}
                semester={semester as never}
                onToggle={onToggle}
                onEdit={onEdit}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-xs font-semibold tracking-wider text-muted uppercase mb-2">
          课程时间表
        </h3>
        {schedule.length === 0 ? (
          <div className="text-sm text-dim py-4 text-center bg-card rounded-lg border border-border">
            今日无课
          </div>
        ) : (
          <div className="relative bg-card rounded-lg border border-border">
            {schedule.map((s) => {
              const c = courseMap[s.course_id]
              return (
                <div
                  key={s.id}
                  className="flex gap-3 p-3 border-b border-border last:border-b-0"
                >
                  <div className="w-16 text-xs text-dim shrink-0">
                    <div>{s.start_time.slice(0, 5)}</div>
                    <div>{s.end_time.slice(0, 5)}</div>
                  </div>
                  <div
                    className="w-1 rounded-full shrink-0"
                    style={{ backgroundColor: c?.color ?? '#6b7280' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text">
                      {c ? `${c.code} ${c.name}` : '未知课程'}
                    </div>
                    <div className="text-xs text-dim">
                      {s.type}
                      {s.location ? ` · ${s.location}` : ''}
                      {s.group_number ? ` · G${s.group_number}` : ''}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
