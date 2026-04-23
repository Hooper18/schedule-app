import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  LayoutGrid,
  ListChecks,
  MapPin,
} from 'lucide-react'
import Layout from '../components/layout/Layout'
import { useSemester } from '../hooks/useSemester'
import { useCourses } from '../hooks/useCourses'
import { useEvents } from '../hooks/useEvents'
import {
  CurrentClassCard,
  NextClassCard,
} from '../components/shared/ClassStatusCards'
import {
  computeCurrentAndNext,
  scheduleByDow,
  toMin,
} from '../lib/sessionUtils'
import { getDaysUntil, todayISO, typeColor, typeLabel } from '../lib/utils'
import type { Course, Event, WeeklySchedule } from '../lib/types'

// Simple three-bucket greeting — morning / afternoon / evening. Anything
// else (before dawn, very late) still folds into the nearest bucket rather
// than surfacing a weird "深夜好" label the user didn't ask for.
function getGreeting(hour: number): string {
  if (hour < 12) return '早上好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

function dateHeading(d: Date): string {
  const days = ['日', '一', '二', '三', '四', '五', '六']
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日  ·  周${days[d.getDay()]}`
}

export default function Home() {
  const { semester, loading: semLoading } = useSemester()
  const { courses, schedule } = useCourses(semester?.id)
  const { events } = useEvents(semester?.id)

  // Per-minute tick so every "now"-derived field (greeting boundary,
  // current/next session countdowns, 已过课程灰显) stays fresh without a
  // full page refresh.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60 * 1000)
    return () => window.clearInterval(id)
  }, [])

  const courseMap = useMemo(
    () => Object.fromEntries(courses.map((c) => [c.id, c])) as Record<string, Course>,
    [courses],
  )
  const byDow = useMemo(() => scheduleByDow(schedule), [schedule])

  const { currentSession, nextSession, nextOffset, minsRemaining, minsUntil } =
    useMemo(() => computeCurrentAndNext(byDow, now), [byDow, now])

  const todayDow = now.getDay()
  const todaySchedule = byDow.get(todayDow) ?? []
  const nowMin = now.getHours() * 60 + now.getMinutes()

  const today = todayISO()
  const upcoming = useMemo(() => {
    return events
      .filter(
        (e) =>
          e.date &&
          e.date >= today &&
          e.status !== 'completed' &&
          e.type !== 'holiday',
      )
      .slice()
      .sort((a, b) => {
        if (a.date === b.date) {
          return (a.time ?? '').localeCompare(b.time ?? '')
        }
        return (a.date ?? '').localeCompare(b.date ?? '')
      })
      .slice(0, 5)
  }, [events, today])

  const greeting = getGreeting(now.getHours())

  return (
    <Layout title="首页">
      <div className="max-w-6xl mx-auto p-4 md:p-6 pb-24 md:pb-8 space-y-4 md:space-y-6">
        <section>
          <h1 className="text-xl md:text-3xl font-semibold text-text">
            {greeting}
          </h1>
          <p className="text-dim text-sm mt-1">{dateHeading(now)}</p>
        </section>

        {semLoading ? (
          <div className="p-8 text-center text-dim text-sm">加载中…</div>
        ) : !semester ? (
          <div className="p-8 text-center text-dim text-sm bg-card rounded-lg border border-border">
            尚未创建学期。请先到「添加」页创建学期并导入课程。
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <div className="space-y-4">
              <CurrentClassCard
                session={currentSession}
                course={
                  currentSession
                    ? courseMap[currentSession.course_id] ?? null
                    : null
                }
                minsRemaining={minsRemaining}
              />
              {nextSession && (
                <NextClassCard
                  session={nextSession}
                  course={courseMap[nextSession.course_id] ?? null}
                  offset={nextOffset}
                  minsUntil={minsUntil}
                />
              )}
              <TodayScheduleCard
                schedule={todaySchedule}
                courseMap={courseMap}
                nowMin={nowMin}
                currentSessionId={currentSession?.id}
              />
            </div>

            <div className="space-y-4">
              <UpcomingCard events={upcoming} courseMap={courseMap} />
              <QuickActions />
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}

function TodayScheduleCard({
  schedule,
  courseMap,
  nowMin,
  currentSessionId,
}: {
  schedule: WeeklySchedule[]
  courseMap: Record<string, Course>
  nowMin: number
  currentSessionId: string | undefined
}) {
  return (
    <section className="bg-card rounded-xl border border-border p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-text">今日课程</h2>
        <span className="text-[11px] text-dim">{schedule.length} 节</span>
      </div>
      {schedule.length === 0 ? (
        <div className="text-xs text-dim py-4 text-center">今日无课</div>
      ) : (
        <ul className="space-y-2">
          {schedule.map((s) => {
            const c = courseMap[s.course_id]
            const eMin = toMin(s.end_time)
            const isCurrent = s.id === currentSessionId
            // Past (already ended) sessions are dimmed but not hidden — the
            // context of "morning classes already done" is useful info.
            const isPast = eMin <= nowMin && !isCurrent
            return (
              <li
                key={s.id}
                className={`flex items-start gap-3 p-2 rounded-md border ${
                  isCurrent
                    ? 'bg-accent/10 border-accent/30'
                    : 'border-transparent'
                } ${isPast ? 'opacity-50' : ''}`}
              >
                <div
                  className="w-1 self-stretch rounded-full shrink-0"
                  style={{ backgroundColor: c?.color ?? '#6b7280' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono text-dim">
                    {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                  </div>
                  <div className="text-sm font-medium text-text truncate">
                    {c ? `${c.code} ${c.name}` : '未知课程'}
                  </div>
                  {s.location && (
                    <div className="text-[11px] text-dim flex items-center gap-0.5 mt-0.5">
                      <MapPin size={10} className="shrink-0" />
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
  )
}

function UpcomingCard({
  events,
  courseMap,
}: {
  events: Event[]
  courseMap: Record<string, Course>
}) {
  return (
    <section className="bg-card rounded-xl border border-border p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-text">即将到来的待办</h2>
        <Link
          to="/todo"
          className="text-[11px] text-accent flex items-center gap-0.5 hover:underline"
        >
          全部 <ArrowRight size={11} />
        </Link>
      </div>
      {events.length === 0 ? (
        <div className="text-xs text-dim py-4 text-center">暂无待办</div>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => {
            const course = e.course_id ? courseMap[e.course_id] : null
            const days = getDaysUntil(e.date)
            const daysLabel =
              days === null
                ? ''
                : days === 0
                  ? '今天'
                  : days === 1
                    ? '明天'
                    : `${days} 天后`
            return (
              <li key={e.id}>
                <Link
                  to="/todo"
                  className="block p-2 rounded-md hover:bg-hover transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded ${typeColor(e.type)}`}
                    >
                      {typeLabel(e.type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text truncate">
                        {e.title}
                      </div>
                      <div className="text-[11px] text-dim flex gap-2 mt-0.5">
                        {course && (
                          <span className="font-mono">{course.code}</span>
                        )}
                        <span>{daysLabel}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function QuickActions() {
  return (
    <section className="bg-card rounded-xl border border-border p-4 shadow-sm space-y-2">
      <h2 className="text-sm font-semibold text-text mb-2">快捷入口</h2>
      <Link
        to="/timetable"
        className="flex items-center justify-between gap-2 p-3 rounded-lg border border-border hover:bg-hover transition-colors"
      >
        <div className="flex items-center gap-3">
          <LayoutGrid size={18} className="text-accent" />
          <span className="text-sm text-text font-medium">查看完整课表</span>
        </div>
        <ArrowRight size={14} className="text-dim" />
      </Link>
      <Link
        to="/todo"
        className="flex items-center justify-between gap-2 p-3 rounded-lg border border-border hover:bg-hover transition-colors"
      >
        <div className="flex items-center gap-3">
          <ListChecks size={18} className="text-accent" />
          <span className="text-sm text-text font-medium">查看所有待办</span>
        </div>
        <ArrowRight size={14} className="text-dim" />
      </Link>
    </section>
  )
}
