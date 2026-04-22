import { useEffect, useMemo, useState } from 'react'
import { MapPin } from 'lucide-react'
import type {
  Course,
  Event,
  EventStatus,
  EventType,
  Semester,
  WeeklySchedule,
} from '../../lib/types'
import { getDaysUntil, isoOf, parseDate, todayISO, weekNumber } from '../../lib/utils'
import EventCard from '../shared/EventCard'

interface Props {
  selectedDate: string
  events: Event[]
  courseMap: Record<string, Course>
  scheduleByDay: Map<number, WeeklySchedule[]>
  semester: Semester
  layers: { showEvents: boolean; showCourses: boolean }
  onToggle: (id: string, status: EventStatus) => void
  onEdit: (e: Event) => void
  onSelectDate?: (iso: string) => void
}

function toMin(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function formatDuration(mins: number): string {
  if (mins < 1) return '不到 1 分钟'
  if (mins < 60) return `${mins} 分钟`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分钟`
}

// Desktop-only right rail: selected-day events → selected-day classes →
// upcoming events list.
export default function DayDetailPanel({
  selectedDate,
  events,
  courseMap,
  scheduleByDay,
  semester,
  layers,
  onToggle,
  onEdit,
  onSelectDate,
}: Props) {
  // Re-render every minute so "next class" highlight stays accurate.
  const [, setNowTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setNowTick((n) => n + 1), 60 * 1000)
    return () => window.clearInterval(id)
  }, [])

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

  const daySchedule = scheduleByDay.get(d.getDay()) ?? []
  const isToday = selectedDate === isoOf(new Date())

  // Current / next session (today only). "Current" = nowMin is inside
  // [start, end). "Next" = the session that starts *after* whatever's
  // current (or after now if nothing is current). `minsRemaining` /
  // `minsUntil` live on this struct so the UI can show countdowns.
  const { currentSession, nextSession, minsRemaining, minsUntil } = useMemo(() => {
    if (!isToday) {
      return {
        currentSession: null,
        nextSession: null,
        minsRemaining: 0,
        minsUntil: 0,
      }
    }
    const now = new Date()
    const nowMin = now.getHours() * 60 + now.getMinutes()
    const cur =
      daySchedule.find(
        (s) => nowMin >= toMin(s.start_time) && nowMin < toMin(s.end_time),
      ) ?? null
    const afterMin = cur ? toMin(cur.end_time) : nowMin
    const nxt = daySchedule.find((s) => toMin(s.start_time) >= afterMin) ?? null
    return {
      currentSession: cur,
      nextSession: nxt,
      minsRemaining: cur ? toMin(cur.end_time) - nowMin : 0,
      minsUntil: nxt ? toMin(nxt.start_time) - nowMin : 0,
    }
  }, [isToday, daySchedule])

  const highlightSession = currentSession ?? nextSession

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
          {layers.showEvents &&
            (selectedDayEvents.length === 0 ? (
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
            ))}
        </section>

        {/* Today's classes */}
        {layers.showCourses && (
          <>
            <div className="border-t border-border" />
            <section className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wider text-muted uppercase">
                今日课程
              </h3>
              {isToday && (
                <div className="space-y-2">
                  <CurrentClassCard
                    session={currentSession}
                    course={
                      currentSession ? courseMap[currentSession.course_id] : null
                    }
                    minsRemaining={minsRemaining}
                  />
                  {nextSession ? (
                    <NextClassCard
                      session={nextSession}
                      course={courseMap[nextSession.course_id] ?? null}
                      minsUntil={minsUntil}
                    />
                  ) : currentSession ? (
                    <div className="rounded-lg border border-border bg-card/60 px-3 py-2 text-[11px] text-dim">
                      这是今天最后一节课
                    </div>
                  ) : daySchedule.length > 0 ? (
                    <div className="rounded-lg border border-border bg-card/60 px-3 py-2 text-[11px] text-dim">
                      今日课程已结束
                    </div>
                  ) : null}
                </div>
              )}
              {daySchedule.length === 0 ? (
                <div className="text-xs text-dim py-4 text-center bg-card rounded-lg border border-border">
                  今日无课
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {daySchedule.map((s) => {
                    const c = courseMap[s.course_id]
                    const isHi = highlightSession?.id === s.id
                    return (
                      <li
                        key={s.id}
                        className={`flex items-start gap-2 px-2 py-1.5 rounded-md ${
                          isHi ? 'bg-accent/10' : ''
                        }`}
                      >
                        <span
                          className="w-1 self-stretch rounded-full shrink-0"
                          style={{ backgroundColor: c?.color ?? '#6b7280' }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-mono text-dim">
                            {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                          </div>
                          <div className="text-xs font-medium text-text truncate">
                            {c ? `${c.code} ${c.name}` : '未知课程'}
                          </div>
                          {s.location && (
                            <div className="text-[10px] text-dim flex items-center gap-0.5">
                              <MapPin size={9} className="shrink-0" />
                              <span className="truncate">{s.location}</span>
                            </div>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </>
        )}

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

function CurrentClassCard({
  session,
  course,
  minsRemaining,
}: {
  session: WeeklySchedule | null
  course: Course | null
  minsRemaining: number
}) {
  // Always render so "currently in class" stays a stable slot users can scan;
  // when nothing is in progress we show an idle state instead of hiding.
  if (!session || !course) {
    return (
      <div className="rounded-lg border border-border bg-card/60 px-3 py-2.5">
        <div className="text-[10px] font-semibold text-dim uppercase tracking-wider">
          正在上课
        </div>
        <div className="text-xs text-dim mt-1">当前无课程进行中</div>
      </div>
    )
  }
  return (
    <div className="rounded-lg border-2 border-accent bg-accent/15 px-3 py-2.5 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold text-accent uppercase tracking-wider">
          ● 正在上课
        </div>
        <div className="text-[10px] text-accent font-medium">
          还剩 {formatDuration(minsRemaining)}
        </div>
      </div>
      <div className="text-sm font-semibold text-text font-mono">
        {course.code}
      </div>
      <div className="text-xs text-text break-words leading-snug">
        {course.name}
      </div>
      <div className="text-[11px] text-dim flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="font-mono">
          {session.start_time.slice(0, 5)}–{session.end_time.slice(0, 5)}
        </span>
        {session.location && (
          <span className="inline-flex items-center gap-0.5">
            <MapPin size={10} className="shrink-0" /> {session.location}
          </span>
        )}
      </div>
    </div>
  )
}

function NextClassCard({
  session,
  course,
  minsUntil,
}: {
  session: WeeklySchedule
  course: Course | null
  minsUntil: number
}) {
  return (
    <div className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2.5 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold text-accent/80 uppercase tracking-wider">
          下一节课
        </div>
        <div className="text-[10px] text-accent/80 font-medium">
          {minsUntil <= 0
            ? '即将开始'
            : `${formatDuration(minsUntil)}后`}
        </div>
      </div>
      <div className="text-sm font-semibold text-text font-mono">
        {course?.code ?? '未知课程'}
      </div>
      {course && (
        <div className="text-xs text-text break-words leading-snug">
          {course.name}
        </div>
      )}
      <div className="text-[11px] text-dim flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="font-mono">
          {session.start_time.slice(0, 5)}–{session.end_time.slice(0, 5)}
        </span>
        {session.location && (
          <span className="inline-flex items-center gap-0.5">
            <MapPin size={10} className="shrink-0" /> {session.location}
          </span>
        )}
      </div>
    </div>
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
