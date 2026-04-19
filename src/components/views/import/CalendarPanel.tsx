import { AlertCircle, CalendarDays } from 'lucide-react'
import { useCalendar } from '../../../hooks/useCalendar'
import type { Semester } from '../../../lib/types'
import { formatShortDate } from '../../../lib/utils'

interface Props {
  semester: Semester
}

const TYPE_COLOR: Record<string, string> = {
  registration: 'bg-sky-500/15 text-sky-500',
  orientation: 'bg-purple-500/15 text-purple-500',
  teaching: 'bg-accent/15 text-accent',
  revision: 'bg-amber-500/15 text-amber-600',
  exam: 'bg-red-500/15 text-red-500',
  holiday: 'bg-emerald-500/15 text-emerald-500',
}

export default function CalendarPanel({ semester }: Props) {
  const { entries, loading, error } = useCalendar(semester.id)

  if (loading) {
    return <div className="p-6 text-center text-dim text-sm">加载中…</div>
  }

  if (error) {
    return <div className="p-4 text-sm text-red-500">{error}</div>
  }

  if (entries.length === 0) {
    return (
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm text-amber-600 flex gap-2 items-start">
        <AlertCircle size={16} className="shrink-0 mt-0.5" />
        <div>
          <div className="font-medium mb-1">请导入校历</div>
          <div className="text-xs text-amber-600/80">
            在 Supabase SQL Editor 里执行{' '}
            <code className="px-1 rounded bg-main/50">supabase/seed_calendar.sql</code>
            （已随项目提交）；脚本会自动填 academic_calendar 并同步
            semesters 的周次/考试日期。
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-dim">
        <CalendarDays size={12} />
        {semester.code} · {entries.length} 条校历记录
      </div>

      <div className="rounded-xl bg-card border border-border divide-y divide-border">
        {entries.map((e) => {
          const color = TYPE_COLOR[e.type] ?? 'bg-hover text-dim'
          const range =
            e.end_date && e.end_date !== e.date
              ? `${formatShortDate(e.date)} → ${formatShortDate(e.end_date)}`
              : formatShortDate(e.date)
          return (
            <div
              key={e.id}
              className="p-3 flex items-center gap-3 text-sm"
            >
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${color}`}
              >
                {e.type}
              </span>
              <div className="flex-1 min-w-0 text-text truncate">{e.title}</div>
              <div className="text-xs text-dim shrink-0">{range}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
