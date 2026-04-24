import { Fragment, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react'
import { useSemester } from '../../hooks/useSemester'
import { useCourses } from '../../hooks/useCourses'
import { useEvents } from '../../hooks/useEvents'
import { useIsDesktop } from '../../hooks/useIsDesktop'
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

// Persist the last-used view mode so re-opening the calendar lands on the
// same surface (e.g. a user who lives in week view doesn't have to switch
// back from month every time).
const MODE_STORAGE_KEY = 'calendar-view-mode'
function loadStoredMode(): Mode {
  if (typeof window === 'undefined') return 'month'
  try {
    const v = window.localStorage.getItem(MODE_STORAGE_KEY)
    if (v === 'month' || v === 'week' || v === 'day') return v
  } catch {
    // localStorage can throw in private mode / disabled cookies; fall through.
  }
  return 'month'
}

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
  const [mode, setModeState] = useState<Mode>(() => loadStoredMode())
  const setMode = (m: Mode) => {
    setModeState(m)
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, m)
    } catch {
      // persist is best-effort; ignore quota / private-mode failures.
    }
  }
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
        {/* Mode switcher + layer toggles on a single row even on mobile —
            matches the month view's header density. Tapping the 月 pill in
            ViewSwitcher is the way back out, so no dedicated back link. */}
        <div className="p-3 border-b border-border flex flex-row flex-wrap items-center justify-center gap-2">
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
        {/* WeekView owns its own two-row header: week-nav first, then
            mode/layers. Swapping the rows here (vs in the outer) keeps the
            scroll-isolation structure contained in one place. */}
        <WeekView
          cursor={weekCursor}
          onCursorChange={setWeekCursor}
          courseMap={courseMap}
          scheduleByDay={scheduleByDay}
          eventsByDate={eventsByDate}
          semester={semester}
          layers={layers}
          onLayersChange={setLayers}
          mode={mode}
          onModeChange={setMode}
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
    <div className="h-full flex flex-col md:flex-row overflow-hidden">
      {/* Left column: top bar, month grid, and (mobile only) event list.
          `min-h-0` is critical — without it, the implicit min-height: auto on
          flex items lets this column grow past the parent, which disables
          the inner drawer's overflow-y scroll and bubbles the gesture up to
          the viewport (dragging the whole month grid with it). */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {/* Month controls + view toggle — fixed (does NOT scroll) */}
      <div className="shrink-0 bg-main border-b border-border">
        <div className="flex items-center justify-between gap-2 px-3 md:px-4 py-2 md:py-3">
          <div className="flex items-center gap-1 md:gap-2">
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
        {/* Mobile-only switcher + layer toggles below the title row. Merged
            onto a single row to save vertical space. */}
        <div className="md:hidden px-3 pb-1.5 flex items-center justify-center gap-2 flex-wrap">
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

      {/* Mobile-only: minimal bottom drawer. No title / navigation / event
          list — the month grid already communicates that. Only renders when
          the selected day actually has classes, so empty days stay clean.
          pb-36 leaves room for BottomNav (h-16) + safe-area so the last
          class card isn't occluded by the nav bar. */}
      {layers.showCourses && daySchedule.length > 0 && (
        // overscroll-contain prevents reach-boundary gestures from bubbling
        // up and dragging the month grid / page along on iOS & Android.
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar px-3 py-2 pb-36 md:hidden">
          <DayCourseList
            date={selected}
            schedule={daySchedule}
            courseMap={courseMap}
          />
        </div>
      )}

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
    <div className="p-1 md:p-2">
      <div className="grid grid-cols-7 md:grid-cols-[36px_repeat(7,1fr)] text-center text-[11px] font-semibold text-muted py-0.5 md:py-2">
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
      className={`h-12 md:h-24 rounded-md md:rounded-lg p-0.5 md:p-1.5 flex flex-col items-center md:items-stretch justify-start border transition-colors ${border} ${bg} ${inMonth ? '' : 'opacity-40'} hover:bg-hover text-left`}
    >
      <div className="w-full flex items-center justify-between gap-1">
        <span
          className={`text-xs md:text-[13px] font-semibold ${dateTextColor} ${dateCircleClass} md:self-start`}
        >
          {d.getDate()}
        </span>
        {/* Right side of the date row holds two compact indicators:
            (a) mobile-only event dots — previously lived in a separate
                `mt-auto pb-0.5` row at the bottom of the 48px cell, which
                meant 4px dots hugging the border and easily missed. Moving
                them up to the date row (same slot as the course count)
                makes the "has events" signal legible at a glance.
            (b) course count label ("N节"). */}
        {inMonth && (dots.length > 0 || daySessions.length > 0) && (
          <div className="flex items-center gap-0.5 md:gap-1">
            {dots.length > 0 && (
              <div className="flex gap-0.5 md:hidden">
                {dots.map((c, i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            )}
            {daySessions.length > 0 && (
              <span
                className="text-[8px] md:text-[10px] text-dim font-mono leading-none font-medium"
                title={`${daySessions.length} 节课`}
              >
                {daySessions.length}节
              </span>
            )}
          </div>
        )}
      </div>

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
}: DayProps) {
  const d = parseDate(date)
  const wk = weekNumber(date, semester)
  const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')} ${['日', '一', '二', '三', '四', '五', '六'][d.getDay()]}`
  return (
    <div className="p-4 space-y-4">
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
                className={`flex gap-2 md:gap-3 p-2 md:p-3 border-b border-border last:border-b-0 ${
                  highlight ? 'bg-accent/5' : ''
                }`}
              >
                <div className="w-14 md:w-16 text-xs text-dim shrink-0 font-mono font-semibold">
                  <div>{s.start_time.slice(0, 5)}</div>
                  <div>{s.end_time.slice(0, 5)}</div>
                </div>
                <div
                  className="w-1 rounded-full shrink-0"
                  style={{ backgroundColor: c?.color ?? '#6b7280' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-text truncate">
                    {c ? `${c.code} ${c.name}` : '未知课程'}
                  </div>
                  <div className="text-xs text-dim flex items-center gap-1 flex-wrap font-medium">
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
  onLayersChange: (l: Layers) => void
  mode: Mode
  onModeChange: (m: Mode) => void
  onSelectDate: (iso: string) => void
}

function WeekView({
  cursor,
  onCursorChange,
  courseMap,
  scheduleByDay,
  eventsByDate,
  semester,
  layers,
  onLayersChange,
  mode,
  onModeChange,
  onSelectDate,
}: WeekViewProps) {
  const isDesktop = useIsDesktop()
  // Mobile packs hours tighter so the day fits in one screen with minimal
  // vertical scroll; desktop keeps the roomier default.
  const HOUR_PX_WEEK = isDesktop ? 56 : 40
  const AXIS_WIDTH = isDesktop ? 56 : 36
  // Mobile: enforce a per-column minimum so course names/locations stay
  // legible and the grid becomes horizontally scrollable. Desktop fills the
  // available width (min 0) like before.
  const COLUMN_MIN = isDesktop ? 0 : 82
  const gridTemplate = `${AXIS_WIDTH}px repeat(7, minmax(${COLUMN_MIN}px, 1fr))`
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
  // tall enough for any recurring session, not just this week's. Default
  // range is 08:00–20:00 because XMUM has evening classes running up to 20:00.
  const { startMin, endMin } = useMemo(() => {
    let s = 8 * 60
    let e = 20 * 60
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
      {/* Row 1: Week nav (date range / prev-next / 本周). First per design —
          the primary context shift lives above the view-mode switcher. */}
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

      {/* Row 2: view-mode switcher + event/course layer toggles. Owned by
          WeekView (not the outer CalendarView) so they sit below the week
          nav only for this view. */}
      <div className="p-2 md:p-3 border-b border-border flex flex-row flex-wrap items-center justify-center gap-2 shrink-0">
        <ViewSwitcher mode={mode} onChange={onModeChange} />
        <LayerToggle layers={layers} onChange={onLayersChange} />
      </div>

      {/* Single scroll container for both axes. Previous attempt nested two
          scroll containers (outer overflow-x, inner overflow-y) so the pill
          strip could live in a "fixed" area above the vertical scroll —
          but the inner container's implicit overflow-x:auto swallowed
          horizontal pans instead of letting them bubble to the outer one,
          which silently killed horizontal scroll on mobile.
          Simpler: one scroll box with overflow-auto; pill is `sticky top-0`
          so it visually pins to the top when scrolling vertically, and
          pans horizontally with the grid because they share this same
          scroll container AND the same gridTemplateColumns. Rows 1 and 2
          above are still shrink-0 and never move. */}
      <div className="flex-1 min-h-0 overflow-auto overscroll-contain pb-24 md:pb-6">
          {/* Row 3: Mobile pill day strip — sticky top-0 pins vertically;
              horizontal pan follows the grid because they live in the same
              scrolling container. Shares gridTemplateColumns with the grid
              below so each pill sits directly above its column. */}
          <div
            className="md:hidden sticky top-0 z-30 bg-main border-b border-border px-1 py-1.5 grid"
            style={{ gridTemplateColumns: gridTemplate }}
          >
          <div aria-hidden />
          {weekDays.map((day) => {
            const iso = isoOf(day)
            const isToday = iso === todayIso
            const dayEvents = layers.showEvents ? eventsByDate.get(iso) ?? [] : []
            return (
              <button
                key={iso}
                type="button"
                onClick={() => onSelectDate(iso)}
                className="mx-0.5 flex flex-col items-center py-1 rounded-xl text-xs transition-colors hover:bg-hover"
              >
                <span
                  className={`text-[9px] leading-none font-medium ${
                    isToday ? 'text-accent' : 'text-dim'
                  }`}
                >
                  周{['日', '一', '二', '三', '四', '五', '六'][day.getDay()]}
                </span>
                <span
                  className={`mt-1 w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold leading-none ${
                    isToday ? 'bg-accent text-white' : 'text-text'
                  }`}
                >
                  {day.getDate()}
                </span>
                {dayEvents.length > 0 && (
                  <span
                    className={`w-1 h-1 rounded-full mt-1 ${isToday ? 'bg-accent' : 'bg-accent/60'}`}
                  />
                )}
              </button>
            )
          })}
          </div>

            <div
              className="grid md:min-w-[800px]"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              {/* Desktop-only header row (8 cells). Hidden on mobile so the pill
                  strip above acts as the column labels instead. */}
          <div className="hidden md:block sticky top-0 z-20 bg-main border-b border-border" />
          {weekDays.map((day) => {
            const iso = isoOf(day)
            const isToday = iso === todayIso
            const dayEvents = layers.showEvents ? eventsByDate.get(iso) ?? [] : []
            return (
              <button
                key={iso}
                type="button"
                onClick={() => onSelectDate(iso)}
                className={`hidden md:flex sticky top-0 z-20 bg-main px-2 py-2 text-xs font-medium border-b border-border flex-col items-center gap-1 hover:bg-hover transition-colors ${
                  isToday ? 'text-accent font-semibold' : 'text-dim'
                }`}
              >
                <div>
                  周{['日', '一', '二', '三', '四', '五', '六'][day.getDay()]}
                </div>
                {/* Today marker is a small filled circle around the date
                    number, matching the month view's convention. No more
                    full-column tint — that read as heavy-handed. */}
                <div
                  className={`font-mono text-[11px] ${
                    isToday
                      ? 'bg-accent text-white rounded-full px-1.5 py-0.5 leading-none font-semibold'
                      : ''
                  }`}
                >
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
                className="absolute right-1 md:right-2 text-[9px] md:text-[10px] text-muted -translate-y-1/2 font-mono font-medium"
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
                // No column-wide tint for today — the header pill & red now
                // line already mark it. A column tint looks heavy with many
                // courses stacked.
                className="relative border-r border-border last:border-r-0"
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
                      className={`absolute left-0.5 right-0.5 md:left-1 md:right-1 rounded md:rounded-md px-1 py-0.5 md:px-1.5 md:py-1 text-left overflow-hidden transition-shadow ${
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
                      {/* Priority: name → location → code. Time is omitted
                          because the axis already shows it. The colored left
                          stripe + bg tint carry the per-course identity so
                          the code line can be deprioritised. `line-clamp-2`
                          lets long names like "Engineering Physics (I)" wrap
                          to two lines instead of being chopped off. */}
                      <div
                        className="text-[10px] md:text-[11px] font-bold line-clamp-2 leading-tight"
                        style={{ color: c.color }}
                      >
                        {c.name}
                      </div>
                      {s.location && height > 24 && (
                        <div className="text-[9px] md:text-[10px] text-text truncate leading-tight font-semibold">
                          {s.location}
                        </div>
                      )}
                      {height > 52 && (
                        <div className="text-[9px] text-dim truncate leading-tight font-mono font-medium mt-0.5">
                          {c.code}
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
