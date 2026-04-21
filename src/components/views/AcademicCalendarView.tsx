import { Fragment, useMemo } from 'react'
import {
  ACADEMIC_CALENDAR_2026,
  type AcademicSemester,
  type Holiday,
} from '../../constants/academicCalendar'
import { isoOf, parseDate, startOfMonth, todayISO } from '../../lib/utils'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

// Lists every month that a semester's date range overlaps, in order.
function monthsInRange(startIso: string, endIso: string): Date[] {
  const start = startOfMonth(parseDate(startIso))
  const end = startOfMonth(parseDate(endIso))
  const months: Date[] = []
  let cursor = start
  while (cursor <= end) {
    months.push(cursor)
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  }
  return months
}

// Week label ("W1"-"W13" / "R" / "E") for the Sunday row of a mini-cal,
// using the semester's own date fields rather than the app-wide CURRENT_
// SEMESTER constant (so we render both semesters' labels correctly).
function weekLabelFor(sundayIso: string, semester: AcademicSemester): string {
  if (
    sundayIso >= semester.teachingStart &&
    sundayIso <= semester.teachingEnd
  ) {
    const start = parseDate(semester.teachingStart)
    const d = parseDate(sundayIso)
    const n =
      Math.floor((d.getTime() - start.getTime()) / (7 * 86400000)) + 1
    if (n >= 1 && n <= 13) return `W${n}`
  }
  if (sundayIso >= semester.revisionStart && sundayIso <= semester.revisionEnd)
    return 'R'
  if (sundayIso >= semester.examStart && sundayIso <= semester.examEnd)
    return 'E'
  return ''
}

function isHoliday(iso: string, holidays: Holiday[]): Holiday | null {
  return holidays.find((h) => h.date === iso) ?? null
}

function buildMonthGrid(monthStart: Date): Date[] {
  const startWeekday = monthStart.getDay()
  const gridStart = new Date(monthStart)
  gridStart.setDate(1 - startWeekday)
  const cells: Date[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    cells.push(d)
  }
  return cells
}

export default function AcademicCalendarView() {
  const { semesters, holidays } = ACADEMIC_CALENDAR_2026
  const todayIso = useMemo(() => todayISO(), [])

  return (
    <div className="h-full overflow-y-auto no-scrollbar p-4 md:p-6 space-y-8 pb-24 md:pb-8">
      <header>
        <h1 className="text-xl md:text-2xl font-semibold text-text">
          XMUM 2026 校历
        </h1>
        <p className="text-xs text-dim mt-1">
          教学周、复习周、考试周、公共假期一览
        </p>
      </header>

      {semesters.map((sem) => (
        <section key={sem.name} className="space-y-4">
          <div>
            <h2 className="text-base md:text-lg font-semibold text-text">
              {sem.name}
            </h2>
            <p className="text-xs text-dim mt-0.5">{sem.period}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {monthsInRange(sem.startDate, sem.endDate).map((m) => (
              <MiniMonth
                key={isoOf(m)}
                monthStart={m}
                semester={sem}
                holidays={holidays}
                todayIso={todayIso}
              />
            ))}
          </div>
        </section>
      ))}

      <Legend holidays={holidays} />
    </div>
  )
}

interface MiniMonthProps {
  monthStart: Date
  semester: AcademicSemester
  holidays: Holiday[]
  todayIso: string
}

function MiniMonth({ monthStart, semester, holidays, todayIso }: MiniMonthProps) {
  const label = `${monthStart.getFullYear()}.${String(monthStart.getMonth() + 1).padStart(2, '0')}`
  const grid = buildMonthGrid(monthStart)
  const rows: Date[][] = []
  for (let i = 0; i < 6; i++) rows.push(grid.slice(i * 7, i * 7 + 7))

  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-text">{label}</span>
      </div>

      <div className="grid grid-cols-[28px_repeat(7,1fr)] text-center text-[10px] text-muted pb-1">
        <div />
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={i === 0 ? 'text-red-500' : ''}>
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[28px_repeat(7,1fr)] gap-px">
        {rows.map((row, idx) => (
          <Fragment key={idx}>
            <div className="flex items-center justify-center text-[9px] font-semibold text-muted">
              {weekLabelFor(isoOf(row[0]), semester)}
            </div>
            {row.map((d) => (
              <MiniCell
                key={isoOf(d)}
                date={d}
                monthStart={monthStart}
                semester={semester}
                holidays={holidays}
                todayIso={todayIso}
              />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

interface MiniCellProps {
  date: Date
  monthStart: Date
  semester: AcademicSemester
  holidays: Holiday[]
  todayIso: string
}

function MiniCell({
  date,
  monthStart,
  semester,
  holidays,
  todayIso,
}: MiniCellProps) {
  const iso = isoOf(date)
  const inMonth = date.getMonth() === monthStart.getMonth()
  const isToday = iso === todayIso
  const holiday = isHoliday(iso, holidays)

  const isExam = iso >= semester.examStart && iso <= semester.examEnd
  const isRevision =
    iso >= semester.revisionStart && iso <= semester.revisionEnd

  let bg = ''
  if (!inMonth) {
    bg = ''
  } else if (holiday) {
    bg = 'bg-amber-200/60 dark:bg-amber-400/20'
  } else if (isExam) {
    bg = 'bg-red-200/60 dark:bg-red-500/20'
  } else if (isRevision) {
    bg = 'bg-orange-200/60 dark:bg-orange-500/20'
  }

  const dateClass = isToday
    ? 'bg-accent text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-semibold'
    : ''

  return (
    <div
      className={`aspect-square flex items-center justify-center text-[10px] rounded ${bg} ${
        inMonth ? 'text-text' : 'text-muted/40'
      }`}
      title={holiday?.name}
    >
      <span className={dateClass}>{date.getDate()}</span>
    </div>
  )
}

function Legend({ holidays }: { holidays: Holiday[] }) {
  return (
    <section className="space-y-4 border-t border-border pt-6">
      <div className="flex flex-wrap gap-3 text-xs text-dim">
        <LegendSwatch className="bg-amber-200/60 dark:bg-amber-400/20" label="公共假期" />
        <LegendSwatch className="bg-orange-200/60 dark:bg-orange-500/20" label="复习周" />
        <LegendSwatch className="bg-red-200/60 dark:bg-red-500/20" label="考试周" />
        <LegendSwatch
          className="bg-accent text-white !w-5 !h-5 rounded-full"
          label="今天"
        />
      </div>

      <div>
        <h3 className="text-xs font-semibold tracking-wider text-muted uppercase mb-2">
          2026 公共假期
        </h3>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-xs text-dim">
          {holidays.map((h) => (
            <li key={h.date + h.name} className="flex gap-2">
              <span className="text-text font-medium w-24 shrink-0">
                {h.date}
              </span>
              <span className="truncate">{h.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function LegendSwatch({
  className,
  label,
}: {
  className: string
  label: string
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block w-4 h-4 rounded ${className}`} />
      {label}
    </span>
  )
}
