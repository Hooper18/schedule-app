import { useEffect, useMemo, useState } from 'react'
import { MapPin } from 'lucide-react'
import { useSemester } from '../../hooks/useSemester'
import { useCourses } from '../../hooks/useCourses'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import type { Course, WeeklySchedule } from '../../lib/types'

// Display labels use Monday-first; the DB column day_of_week is 0=Sun..6=Sat
// (inherited from AC Online), so remap for layout.
const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const DAY_LABELS_SHORT = ['一', '二', '三', '四', '五', '六', '日']

function dayIndexMondayFirst(dow: number) {
  return (dow + 6) % 7
}

function toMin(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function fmtHour(mins: number) {
  const h = Math.floor(mins / 60)
  return `${String(h).padStart(2, '0')}:00`
}

function hashCode(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0
  return h
}

// Derive a stable pastel color from the course code. hsla works in both light
// and dark themes because the alpha-on-background visual is theme-agnostic,
// and the higher-sat accent stripe/text doubles as the card's "brand".
function colorForCode(code: string) {
  const h = hashCode(code) % 360
  return {
    stripe: `hsl(${h}, 68%, 55%)`,
    bg: `hsla(${h}, 75%, 55%, 0.12)`,
  }
}

export default function WeeklyScheduleView() {
  const { semester } = useSemester()
  const { courses, schedule, loading } = useCourses(semester?.id)
  const isDesktop = useIsDesktop()
  // Vertical density: the desktop grid breathes; on mobile we pack hours
  // tighter so users see more of the day without scrolling.
  const HOUR_PX = isDesktop ? 64 : 44

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60 * 1000)
    return () => window.clearInterval(id)
  }, [])

  const courseById = useMemo(() => {
    const m = new Map<string, Course>()
    for (const c of courses) m.set(c.id, c)
    return m
  }, [courses])

  // Default range is 08:00–20:00 — XMUM has evening classes running up to
  // 20:00, so the axis needs to cover them even if the current schedule
  // doesn't happen to stretch that far.
  const { startMin, endMin } = useMemo(() => {
    let s = 8 * 60
    let e = 20 * 60
    for (const slot of schedule) {
      s = Math.min(s, toMin(slot.start_time))
      e = Math.max(e, toMin(slot.end_time))
    }
    return {
      startMin: Math.floor(s / 60) * 60,
      endMin: Math.ceil(e / 60) * 60,
    }
  }, [schedule])

  const hours = (endMin - startMin) / 60
  const gridHeight = hours * HOUR_PX

  const sessionsByDay = useMemo(() => {
    const out: WeeklySchedule[][] = [[], [], [], [], [], [], []]
    for (const s of schedule) {
      out[dayIndexMondayFirst(s.day_of_week)].push(s)
    }
    return out
  }, [schedule])

  const todayDow = dayIndexMondayFirst(now.getDay())
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const nowInRange = nowMin >= startMin && nowMin <= endMin

  // Monday of the displayed week — used for the column header date numbers.
  const weekDates = useMemo(() => {
    const monday = new Date(now)
    monday.setHours(0, 0, 0, 0)
    monday.setDate(monday.getDate() - todayDow)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      return d
    })
  }, [now, todayDow])

  const [mobileDay, setMobileDay] = useState(todayDow)
  // Auto-advance the mobile selection when the real weekday rolls over, but
  // only if the user hasn't manually picked another day yet this session.
  const [mobileDayUserSet, setMobileDayUserSet] = useState(false)
  useEffect(() => {
    if (!mobileDayUserSet) setMobileDay(todayDow)
  }, [todayDow, mobileDayUserSet])

  const timeLabels: number[] = []
  for (let m = startMin; m <= endMin; m += 60) timeLabels.push(m)

  if (loading) {
    return (
      <div className="p-8 text-center text-dim text-sm">加载中…</div>
    )
  }
  if (!semester) {
    return (
      <div className="p-8 text-center text-dim text-sm">尚未创建学期</div>
    )
  }
  if (schedule.length === 0) {
    return (
      <div className="p-8 text-center text-dim text-sm space-y-2">
        <p>本学期还没有课程表</p>
        <p className="text-xs">请先到「导入」页导入课程</p>
      </div>
    )
  }

  const renderSession = (s: WeeklySchedule) => {
    const c = courseById.get(s.course_id)
    if (!c) return null
    const startM = toMin(s.start_time)
    const endM = toMin(s.end_time)
    const top = ((startM - startMin) / 60) * HOUR_PX
    const height = Math.max(24, ((endM - startM) / 60) * HOUR_PX - 2)
    const d = dayIndexMondayFirst(s.day_of_week)
    const isNow = d === todayDow && nowMin >= startM && nowMin < endM
    const clr = colorForCode(c.code)
    return (
      <div
        key={s.id}
        className={`absolute left-1 right-1 rounded-lg px-1.5 py-1 md:px-2 md:py-1.5 overflow-hidden ${
          isNow ? 'ring-2 ring-accent shadow-md' : 'shadow-sm'
        }`}
        style={{
          top: `${top}px`,
          height: `${height}px`,
          backgroundColor: clr.bg,
          borderLeft: `3px solid ${clr.stripe}`,
        }}
        title={`${c.code} ${c.name}\n${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}${s.location ? '\n' + s.location : ''}`}
      >
        <div
          className="text-[11px] font-bold truncate leading-tight"
          style={{ color: clr.stripe }}
        >
          {c.code}
        </div>
        <div className="text-[11px] text-text truncate leading-tight mt-0.5 font-semibold">
          {c.name}
        </div>
        {height > 42 && (
          <div className="text-[10px] text-dim truncate leading-tight mt-0.5 font-medium">
            {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
          </div>
        )}
        {s.location && height > 58 && (
          <div className="flex items-center gap-0.5 text-[10px] text-dim truncate leading-tight mt-0.5 font-medium">
            <MapPin size={9} className="shrink-0" />
            <span className="truncate">{s.location}</span>
          </div>
        )}
      </div>
    )
  }

  // Skip the i=0 line — the header's bottom border serves as the top edge of
  // the body, and a duplicated line at top:0 was visually doubling it.
  const renderGridBackground = () => (
    <>
      {Array.from({ length: hours }).map((_, i) =>
        i === 0 ? null : (
          <div
            key={i}
            className="absolute left-0 right-0 border-t border-border/60"
            style={{ top: `${i * HOUR_PX}px` }}
          />
        ),
      )}
    </>
  )

  const renderNowLine = () => (
    <div
      className="absolute left-0 right-0 h-0.5 bg-red-500 z-10 pointer-events-none"
      style={{ top: `${((nowMin - startMin) / 60) * HOUR_PX}px` }}
    >
      <div className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-red-500" />
    </div>
  )

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Mobile day picker */}
      <div className="md:hidden px-2 py-1.5 border-b border-border flex gap-1 shrink-0">
        {DAY_LABELS_SHORT.map((lbl, i) => {
          const active = mobileDay === i
          const isToday = i === todayDow
          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                setMobileDay(i)
                setMobileDayUserSet(true)
              }}
              className={`flex-1 min-w-0 flex flex-col items-center py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                active
                  ? 'bg-accent text-white'
                  : isToday
                    ? 'bg-accent/10 text-accent'
                    : 'text-dim hover:bg-hover'
              }`}
            >
              <span className="text-[9px] leading-none font-medium">周</span>
              <span className="leading-none mt-0.5 font-bold">{lbl}</span>
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-auto pb-24 md:pb-6">
        {/* Desktop week grid: header is its own sticky row so bg-main covers
            every column uniformly — sticky-on-each-cell was leaving columns
            without sessions looking like the body grid lines pierced up. */}
        <div className="hidden md:block min-w-[880px]">
          <div
            className="sticky top-0 z-20 grid bg-main border-b border-border"
            style={{ gridTemplateColumns: '60px repeat(7, minmax(0, 1fr))' }}
          >
            <div className="px-2 py-2" />
            {DAY_LABELS.map((d, i) => (
              <div
                key={i}
                className={`px-2 py-2 text-xs text-center ${
                  i === todayDow ? 'text-accent font-semibold' : 'text-dim font-medium'
                }`}
              >
                <div>{d}</div>
                <div className="text-[10px] text-muted font-normal mt-0.5">
                  {weekDates[i].getMonth() + 1}/{weekDates[i].getDate()}
                </div>
              </div>
            ))}
          </div>

          <div
            className="grid"
            style={{ gridTemplateColumns: '60px repeat(7, minmax(0, 1fr))' }}
          >
            <div
              className="relative border-r border-border"
              style={{ height: `${gridHeight}px` }}
            >
              {timeLabels.map((m) => (
                <div
                  key={m}
                  className="absolute right-2 text-[10px] text-muted -translate-y-1/2 font-mono"
                  style={{ top: `${((m - startMin) / 60) * HOUR_PX}px` }}
                >
                  {fmtHour(m)}
                </div>
              ))}
            </div>

            {sessionsByDay.map((sessions, dayIdx) => (
              <div
                key={dayIdx}
                // No column-wide today tint — header already marks today, and
                // the red now-line runs through this column anyway.
                className="relative border-r border-border last:border-r-0"
                style={{ height: `${gridHeight}px` }}
              >
                {renderGridBackground()}
                {nowInRange && dayIdx === todayDow && renderNowLine()}
                {sessions.map(renderSession)}
              </div>
            ))}
          </div>
        </div>

        {/* Mobile single-day view */}
        <div className="md:hidden flex" style={{ height: `${gridHeight}px` }}>
          <div className="w-12 relative shrink-0 border-r border-border">
            {timeLabels.map((m) => (
              <div
                key={m}
                className="absolute right-1 text-[10px] text-muted -translate-y-1/2 font-mono"
                style={{ top: `${((m - startMin) / 60) * HOUR_PX}px` }}
              >
                {fmtHour(m)}
              </div>
            ))}
          </div>
          <div className="relative flex-1 min-w-0">
            {renderGridBackground()}
            {nowInRange && mobileDay === todayDow && renderNowLine()}
            {sessionsByDay[mobileDay].map(renderSession)}
          </div>
        </div>
      </div>
    </div>
  )
}
