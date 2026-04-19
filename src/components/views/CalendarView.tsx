import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { useSemester } from '../../hooks/useSemester'
import { useCourses } from '../../hooks/useCourses'
import { useEvents } from '../../hooks/useEvents'
import EventCard from '../shared/EventCard'
import EventModal from '../shared/EventModal'
import type { Event, Course, WeeklySchedule } from '../../lib/types'
import { addMonths, isoOf, parseDate, startOfMonth, weekNumber } from '../../lib/utils'

type Mode = 'month' | 'day'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export default function CalendarView() {
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
    <div className="h-full flex flex-col">
      {/* Month controls + grid — fixed (does NOT scroll) */}
      <div className="shrink-0 bg-main border-b border-border">
        <div className="flex items-center justify-center gap-2 px-4 py-3">
          <button
            onClick={() => setCursor((c) => addMonths(c, -1))}
            className="p-1.5 rounded hover:bg-hover text-dim"
            aria-label="上个月"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="font-semibold text-text min-w-[5rem] text-center">
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

      {/* Events for selected day — scrolls independently, no visible scrollbar */}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-4 space-y-3 pb-24">
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
  semester: { exam_start: string | null; exam_end: string | null; revision_start: string | null; end_date: string }
  eventsByDate: Map<string, Event[]>
  courseMap: Record<string, Course>
  onSelect: (iso: string) => void
}

function MonthGrid({ grid, cursor, selected, semester, eventsByDate, courseMap, onSelect }: MonthProps) {
  return (
    <div className="p-2">
      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted py-2">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={i === 0 ? 'text-red-500' : ''}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {grid.map((d) => {
          const iso = isoOf(d)
          const inMonth = d.getMonth() === cursor.getMonth()
          const isToday = iso === isoOf(new Date())
          const isSelected = iso === selected
          const dayEvents = eventsByDate.get(iso) ?? []
          const dots = dayEvents.slice(0, 4).map((e) => {
            if (e.type === 'holiday') return '#10b981'
            if (e.course_id && courseMap[e.course_id]) return courseMap[e.course_id].color
            return '#6b7280'
          })
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

          // Selected day gets accent background; overrides the season tint.
          const bg = isSelected
            ? 'bg-accent/20'
            : inMonth
              ? seasonBg
              : 'bg-card'

          const border = isSelected
            ? 'border-accent'
            : isToday
              ? 'border-accent/60'
              : 'border-transparent'

          return (
            <button
              key={iso}
              onClick={() => onSelect(iso)}
              className={`aspect-square rounded-lg p-1 flex flex-col items-center justify-start border transition-colors ${border} ${bg} ${inMonth ? '' : 'opacity-40'} hover:bg-hover`}
            >
              <span
                className={`text-xs ${
                  hasHoliday
                    ? 'text-emerald-500 font-semibold'
                    : isSunday && inMonth
                      ? 'text-red-500'
                      : inMonth
                        ? 'text-text'
                        : 'text-muted'
                }`}
              >
                {d.getDate()}
              </span>
              {dots.length > 0 && (
                <div className="flex gap-0.5 mt-auto pb-0.5">
                  {dots.map((c, i) => (
                    <span
                      key={i}
                      className="w-1 h-1 rounded-full"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
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
