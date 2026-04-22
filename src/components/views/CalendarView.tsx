import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  MapPin,
} from 'lucide-react'
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

type Mode = 'month' | 'week' | 'day'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

const MODE_LABELS: Record<Mode, string> = { month: '月', week: '周', day: '日' }

interface Layers {
  showEvents: boolean
  showCourses: boolean
}

// Shared pill switcher rendered in both the desktop month header and the
// mobile sub-header row. Keeps visual language identical across breakpoints.
function ViewSwitcher({
  mode,
  onChange,
}: {
  mode: Mode
  onChange: (m: Mode) => void
}) {
  return (
    <div className="inline-flex bg-card rounded-full p-1 border border-border">
      {(['month', 'week', 'day'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`px-4 py-1 rounded-full text-xs font-medium transition-colors ${
            mode === m
              ? 'bg-accent text-white shadow-sm'
              : 'text-dim hover:text-text'
          }`}
        >
          {MODE_LABELS[m]}
        </button>
      ))}
    </div>
  )
}

// Dual-state layer toggles — each independently controls whether events /
// weekly courses appear in the calendar grid.
function LayerToggle({
  layers,
  onChange,
}: {
  layers: Layers
  onChange: (l: Layers) => void
}) {
  const base =
    'px-3 py-1 rounded-full text-xs font-medium border transition-colors'
  const active = 'bg-accent/15 text-accent border-accent/40'
  const inactive = 'bg-card text-dim border-border hover:text-text'
  return (
    <div className="inline-flex gap-1.5">
      <button
        type="button"
        onClick={() => onChange({ ...layers, showEvents: !layers.showEvents })}
        className={`${base} ${layers.showEvents ? active : inactive}`}
      >
        事件
      </button>
      <button
        type="button"
        onClick={() =>
          onChange({ ...layers, showCourses: !layers.showCourses })
        }
        className={`${base} ${layers.showCourses ? active : inactive}`}
      >
        课程
      </button>
    </div>
  )
}

// Desktop pill palette — soft light bg + dark text, with dark-mode variants.
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

// Map day_of_week (0=Sun..6=Sat) → WeeklySchedule[] for O(1) cell lookups.
function scheduleByDow(schedule: WeeklySchedule[]) {
  const m = new Map<number, WeeklySchedule[]>()
  for (const s of schedule) {
    const arr = m.get(s.day_of_week) ?? []
    arr.push(s)
    m.set(s.day_of_week, arr)
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => a.start_time.localeCompare(b.start_time))
  }
  return m
}

function toMin(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

// Find the next-up / currently-in-progress session for a given date+clock.
// Used to highlight "下一节课" in the day view and sidebar panel.
function findNextSession(
  date: string,
  schedule: WeeklySchedule[],
): WeeklySchedule | null {
  const now = new Date()
  const today = isoOf(now)
  if (date !== today) return null
  const nowMin = now.getHours() * 60 + now.getMinutes()
  // Prefer in-progress session; otherwise the first start_time > nowMin.
  const inProgress = schedule.find(
    (s) => nowMin >= toMin(s.start_time) && nowMin < toMin(s.end_time),
  )
  if (inProgress) return inProgress
  return schedule.find((s) => toMin(s.start_time) > nowMin) ?? null
}

export default function CalendarView() {
  const { semester } = useSemester()
  const { courses, schedule } = useCourses(semester?.id)
  const { events, setStatus, reload } = useEvents(semester?.id)

  const [cursor, setCursor] = useState<Date>(startOfMonth(new Date()))
  const [selected, setSelected] = useState<string>(isoOf(new Date()))
  const [mode, setMode] = useState<Mode>('month')
  const [editing, setEditing] = useState<Event | null>(null)
  const [layers, setLayers] = useState<Layers>({
    showEvents: true,
    showCourses: true,
  })
  const [weekCursor, setWeekCursor] = useState<Date>(new Date())

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

  const scheduleByDay = useMemo(() => scheduleByDow(schedule), [schedule])

  const grid = useMemo(() => buildMonthGrid(cursor), [cursor])

  const selectedEvents = eventsByDate.get(selected) ?? []
  const selectedDayOfWeek = parseDate(selected).getDay()
  const daySchedule = scheduleByDay.get(selectedDayOfWeek) ?? []

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
    setWeekCursor(today)
  }

  if (mode === 'day') {
    return (
      <div className="h-full overflow-y-auto no-scrollbar">
        <div className="p-3 border-b border-border flex flex-col md:flex-row items-center justify-center gap-2">
          <ViewSwitcher mode={mode} onChange={setMode} />
          <LayerToggle layers={layers} onChange={setLayers} />
        </div>
        <DayView
          date={selected}
          events={selectedEvents}
          courseMap={courseMap}
          semester={semester}
          schedule={daySchedule}
          layers={layers}
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

  if (mode === 'week') {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="p-3 border-b border-border flex flex-col md:flex-row items-center justify-center gap-2 shrink-0">
          <ViewSwitcher mode={mode} onChange={setMode} />
          <LayerToggle layers={layers} onChange={setLayers} />
        </div>
        <WeekView
          cursor={weekCursor}
          onCursorChange={setWeekCursor}
          courseMap={courseMap}
          scheduleByDay={scheduleByDay}
          eventsByDate={eventsByDate}
          semester={semester}
          layers={layers}
          onSelectDate={(iso) => {
            setSelected(iso)
            setMode('day')
          }}
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
            <div className="hidden md:flex items-center gap-2">
              <ViewSwitcher mode={mode} onChange={setMode} />
              <LayerToggle layers={layers} onChange={setLayers} />
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
        {/* Mobile-only switcher + layer toggles below the title row. */}
        <div className="md:hidden px-4 pb-3 flex flex-col items-center gap-2">
          <ViewSwitcher mode={mode} onChange={setMode} />
          <LayerToggle layers={layers} onChange={setLayers} />
        </div>
        <MonthGrid
          grid={grid}
          cursor={cursor}
          selected={selected}
          semester={semester}
          eventsByDate={eventsByDate}
          scheduleByDay={scheduleByDay}
          courseMap={courseMap}
          layers={layers}
          onSelect={setSelected}
        />
      </div>

      {/* Mobile: selected-day event + course list */}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-4 space-y-4 pb-24 md:hidden">
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

        {layers.showEvents && (
          selectedEvents.length === 0 ? (
            <div className="text-sm text-dim py-8 text-center bg-card rounded-xl border border-border">
              今日无事件
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
          )
        )}

        {layers.showCourses && (
          <DayCourseList
            date={selected}
            schedule={daySchedule}
            courseMap={courseMap}
          />
        )}
      </div>

      </div>
      {/* Right detail panel — desktop only */}
      <DayDetailPanel
        selectedDate={selected}
        events={events}
        courseMap={courseMap}
        scheduleByDay={scheduleByDay}
        semester={semester}
        layers={layers}
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
  scheduleByDay: Map<number, WeeklySchedule[]>
  courseMap: Record<string, Course>
  layers: Layers
  onSelect: (iso: string) => void
}

function MonthGrid({
  grid,
  cursor,
  selected,
  semester,
  eventsByDate,
  scheduleByDay,
  courseMap,
  layers,
  onSelect,
}: MonthProps) {
  const todayIso = isoOf(new Date())
  const rows: Date[][] = []
  for (let i = 0; i < 6; i++) rows.push(grid.slice(i * 7, i * 7 + 7))

  return (
    <div className="p-2">
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
                scheduleByDay={scheduleByDay}
                courseMap={courseMap}
                layers={layers}
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
  scheduleByDay: Map<number, WeeklySchedule[]>
  courseMap: Record<string, Course>
  layers: Layers
  onSelect: (iso: string) => void
}

function Cell({
  d,
  cursor,
  selected,
  todayIso,
  semester,
  eventsByDate,
  scheduleByDay,
  courseMap,
  layers,
  onSelect,
}: CellProps) {
  const iso = isoOf(d)
  const inMonth = d.getMonth() === cursor.getMonth()
  const isToday = iso === todayIso
  const isSelected = iso === selected
  const dayEvents = layers.showEvents ? eventsByDate.get(iso) ?? [] : []
  const daySessions = layers.showCourses
    ? scheduleByDay.get(d.getDay()) ?? []
    : []
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

  const dots = dayEvents.slice(0, 4).map((e) => {
    if (e.type === 'holiday') return '#10b981'
    if (e.course_id && courseMap[e.course_id]) return courseMap[e.course_id].color
    return '#6b7280'
  })

  const visiblePills = dayEvents.slice(0, 3)
  const hiddenCount = Math.max(0, dayEvents.length - visiblePills.length)

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
      <div className="w-full flex items-center justify-between gap-1">
        <span
          className={`text-xs md:text-[13px] ${dateTextColor} ${dateCircleClass} md:self-start`}
        >
          {d.getDate()}
        </span>
        {inMonth && daySessions.length > 0 && (
          <span
            className="text-[9px] md:text-[10px] text-dim font-mono leading-none"
            title={`${daySessions.length} 节课`}
          >
            {daySessions.length}节
          </span>
        )}
      </div>

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
  layers: Layers
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
  layers,
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

      {layers.showEvents && (
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
      )}

      {layers.showCourses && (
        <DayCourseList date={date} schedule={schedule} courseMap={courseMap} />
      )}
    </div>
  )
}

// Shared "today's classes" list used by both DayView and the mobile month
// view's selected-day drawer. Highlights the next-up / in-progress class when
// the date is today.
export function DayCourseList({
  date,
  schedule,
  courseMap,
}: {
  date: string
  schedule: WeeklySchedule[]
  courseMap: Record<string, Course>
}) {
  // Re-render every minute so "next class" stays accurate as time advances.
  const [, setNowTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setNowTick((n) => n + 1), 60 * 1000)
    return () => window.clearInterval(id)
  }, [])

  const nextSession = findNextSession(date, schedule)
  const isToday = date === isoOf(new Date())
  const nextCourse = nextSession ? courseMap[nextSession.course_id] : null

  return (
    <section>
      <h3 className="text-xs font-semibold tracking-wider text-muted uppercase mb-2">
        课程时间表
      </h3>
      {isToday && nextSession && nextCourse && (
        <div className="mb-2 rounded-lg border border-accent/40 bg-accent/10 p-2.5 flex items-center gap-2">
          <span className="text-[10px] font-semibold text-accent bg-accent/15 px-1.5 py-0.5 rounded shrink-0">
            下一节
          </span>
          <span className="flex-1 min-w-0 text-sm text-text truncate">
            <span className="font-semibold font-mono">{nextCourse.code}</span>{' '}
            <span className="text-dim">·</span> {nextSession.start_time.slice(0, 5)}
            {nextSession.location && (
              <>
                {' '}
                <span className="text-dim">·</span> {nextSession.location}
              </>
            )}
          </span>
        </div>
      )}
      {schedule.length === 0 ? (
        <div className="text-sm text-dim py-4 text-center bg-card rounded-lg border border-border">
          今日无课
        </div>
      ) : (
        <div className="relative bg-card rounded-lg border border-border">
          {schedule.map((s) => {
            const c = courseMap[s.course_id]
            const highlight = nextSession?.id === s.id && isToday
            return (
              <div
                key={s.id}
                className={`flex gap-3 p-3 border-b border-border last:border-b-0 ${
                  highlight ? 'bg-accent/5' : ''
                }`}
              >
                <div className="w-16 text-xs text-dim shrink-0 font-mono">
                  <div>{s.start_time.slice(0, 5)}</div>
                  <div>{s.end_time.slice(0, 5)}</div>
                </div>
                <div
                  className="w-1 rounded-full shrink-0"
                  style={{ backgroundColor: c?.color ?? '#6b7280' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-text truncate">
                    {c ? `${c.code} ${c.name}` : '未知课程'}
                  </div>
                  <div className="text-xs text-dim flex items-center gap-1 flex-wrap">
                    <span>{s.type}</span>
                    {s.location && (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-0.5">
                          <MapPin size={10} /> {s.location}
                        </span>
                      </>
                    )}
                    {s.group_number && (
                      <>
                        <span>·</span>
                        <span>G{s.group_number}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

interface WeekViewProps {
  cursor: Date
  onCursorChange: (d: Date) => void
  courseMap: Record<string, Course>
  scheduleByDay: Map<number, WeeklySchedule[]>
  eventsByDate: Map<string, Event[]>
  semester: Parameters<typeof weekNumber>[1]
  layers: Layers
  onSelectDate: (iso: string) => void
}

const HOUR_PX_WEEK = 56

function WeekView({
  cursor,
  onCursorChange,
  courseMap,
  scheduleByDay,
  eventsByDate,
  semester,
  layers,
  onSelectDate,
}: WeekViewProps) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60 * 1000)
    return () => window.clearInterval(id)
  }, [])

  // Monday-based week start. getDay() returns 0=Sun..6=Sat; convert to
  // offset so that Monday is index 0.
  const weekStart = useMemo(() => {
    const d = new Date(cursor)
    const dow = d.getDay()
    const offset = (dow + 6) % 7
    d.setDate(d.getDate() - offset)
    d.setHours(0, 0, 0, 0)
    return d
  }, [cursor])

  const weekDays = useMemo(() => {
    const arr: Date[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart)
      d.setDate(weekStart.getDate() + i)
      arr.push(d)
    }
    return arr
  }, [weekStart])

  // Compute start / end hours from the full schedule so the grid is always
  // tall enough for any recurring session, not just this week's.
  const { startMin, endMin } = useMemo(() => {
    let s = 8 * 60
    let e = 18 * 60
    for (const arr of scheduleByDay.values()) {
      for (const sess of arr) {
        s = Math.min(s, toMin(sess.start_time))
        e = Math.max(e, toMin(sess.end_time))
      }
    }
    return {
      startMin: Math.floor(s / 60) * 60,
      endMin: Math.ceil(e / 60) * 60,
    }
  }, [scheduleByDay])

  const hours = (endMin - startMin) / 60
  const gridHeight = hours * HOUR_PX_WEEK

  const timeLabels: number[] = []
  for (let m = startMin; m <= endMin; m += 60) timeLabels.push(m)

  const todayIso = isoOf(new Date())
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const nowInRange = nowMin >= startMin && nowMin <= endMin

  const shiftWeek = (delta: number) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + delta * 7)
    onCursorChange(d)
  }

  const weekLabelStr = (() => {
    const s = weekStart
    const e = weekDays[6]
    const fmt = (x: Date) =>
      `${String(x.getMonth() + 1).padStart(2, '0')}/${String(x.getDate()).padStart(2, '0')}`
    return `${fmt(s)} – ${fmt(e)}`
  })()
  const wk = weekNumber(isoOf(weekStart), semester)

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Week controls */}
      <div className="px-4 py-2 flex items-center justify-between border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftWeek(-1)}
            className="p-1.5 rounded hover:bg-hover text-dim"
            aria-label="上一周"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="text-sm font-semibold text-text min-w-[7rem] text-center">
            {weekLabelStr}
            {wk !== null && (
              <span className="ml-1 text-[10px] text-dim font-normal">
                · 第{wk}周
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => shiftWeek(1)}
            className="p-1.5 rounded hover:bg-hover text-dim"
            aria-label="下一周"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <button
          type="button"
          onClick={() => onCursorChange(new Date())}
          className="text-xs font-medium px-3 py-1 rounded-full border border-accent text-accent hover:bg-accent/10 transition-colors"
        >
          本周
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-auto pb-6">
        <div
          className="grid min-w-[800px]"
          style={{ gridTemplateColumns: '56px repeat(7, minmax(0, 1fr))' }}
        >
          <div className="sticky top-0 z-20 bg-main border-b border-border" />
          {weekDays.map((day) => {
            const iso = isoOf(day)
            const isToday = iso === todayIso
            const dayEvents = layers.showEvents ? eventsByDate.get(iso) ?? [] : []
            return (
              <button
                key={iso}
                type="button"
                onClick={() => onSelectDate(iso)}
                className={`sticky top-0 z-20 bg-main px-2 py-2 text-xs font-medium border-b border-border flex flex-col items-center gap-1 hover:bg-hover transition-colors ${
                  isToday ? 'text-accent font-semibold' : 'text-dim'
                }`}
              >
                <div>
                  周{['日', '一', '二', '三', '四', '五', '六'][day.getDay()]}
                </div>
                <div className="font-mono text-[11px]">
                  {day.getMonth() + 1}/{day.getDate()}
                </div>
                {dayEvents.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-0.5 w-full">
                    {dayEvents.slice(0, 3).map((e) => (
                      <span
                        key={e.id}
                        className={`text-[9px] leading-tight px-1 rounded truncate max-w-full ${eventPillClass(e.type)}`}
                        title={e.title}
                      >
                        {e.title.length > 8
                          ? e.title.slice(0, 7) + '…'
                          : e.title}
                      </span>
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="text-[9px] text-muted">
                        +{dayEvents.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </button>
            )
          })}

          {/* Time axis */}
          <div
            className="relative border-r border-border"
            style={{ height: `${gridHeight}px` }}
          >
            {timeLabels.map((m) => (
              <div
                key={m}
                className="absolute right-2 text-[10px] text-muted -translate-y-1/2 font-mono"
                style={{ top: `${((m - startMin) / 60) * HOUR_PX_WEEK}px` }}
              >
                {String(Math.floor(m / 60)).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((day) => {
            const iso = isoOf(day)
            const isToday = iso === todayIso
            const sessions = layers.showCourses
              ? scheduleByDay.get(day.getDay()) ?? []
              : []
            return (
              <div
                key={iso}
                className={`relative border-r border-border last:border-r-0 ${
                  isToday ? 'bg-accent/[0.03]' : ''
                }`}
                style={{ height: `${gridHeight}px` }}
              >
                {Array.from({ length: hours }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 border-t border-border/60"
                    style={{ top: `${i * HOUR_PX_WEEK}px` }}
                  />
                ))}
                {nowInRange && isToday && (
                  <div
                    className="absolute left-0 right-0 h-0.5 bg-red-500 z-10 pointer-events-none"
                    style={{
                      top: `${((nowMin - startMin) / 60) * HOUR_PX_WEEK}px`,
                    }}
                  >
                    <div className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-red-500" />
                  </div>
                )}
                {sessions.map((s) => {
                  const c = courseMap[s.course_id]
                  if (!c) return null
                  const startM = toMin(s.start_time)
                  const endM = toMin(s.end_time)
                  const top = ((startM - startMin) / 60) * HOUR_PX_WEEK
                  const height = Math.max(
                    22,
                    ((endM - startM) / 60) * HOUR_PX_WEEK - 2,
                  )
                  const isNow =
                    isToday && nowMin >= startM && nowMin < endM
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onSelectDate(iso)}
                      className={`absolute left-1 right-1 rounded-md px-1.5 py-1 text-left overflow-hidden transition-shadow ${
                        isNow ? 'ring-2 ring-accent shadow-md' : 'shadow-sm'
                      }`}
                      style={{
                        top: `${top}px`,
                        height: `${height}px`,
                        backgroundColor: `${c.color}22`,
                        borderLeft: `3px solid ${c.color}`,
                      }}
                      title={`${c.code} ${c.name}\n${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}${s.location ? '\n' + s.location : ''}`}
                    >
                      <div
                        className="text-[10px] font-semibold truncate leading-tight font-mono"
                        style={{ color: c.color }}
                      >
                        {c.code}
                      </div>
                      {height > 34 && (
                        <div className="text-[10px] text-text truncate leading-tight">
                          {s.start_time.slice(0, 5)}
                          {s.location ? ` · ${s.location}` : ''}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
