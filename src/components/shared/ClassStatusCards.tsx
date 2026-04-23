import { MapPin } from 'lucide-react'
import type { Course, WeeklySchedule } from '../../lib/types'
import { formatDuration, relativeDayLabel } from '../../lib/sessionUtils'

// Rendered even when nothing is in progress — a stable "正在上课" slot users
// can scan without the card appearing/disappearing unpredictably.
export function CurrentClassCard({
  session,
  course,
  minsRemaining,
}: {
  session: WeeklySchedule | null
  course: Course | null
  minsRemaining: number
}) {
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

export function NextClassCard({
  session,
  course,
  offset,
  minsUntil,
}: {
  session: WeeklySchedule
  course: Course | null
  offset: number
  minsUntil: number
}) {
  const badge =
    offset === 0
      ? minsUntil <= 0
        ? '即将开始'
        : `${formatDuration(minsUntil)}后`
      : relativeDayLabel(offset, session.day_of_week)

  return (
    <div className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2.5 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold text-accent/80 uppercase tracking-wider">
          下一节课
        </div>
        <div className="text-[10px] text-accent/80 font-medium">{badge}</div>
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
