import { Check, Undo2, Users, Pencil, AlertTriangle } from 'lucide-react'
import type { Event, Course, Semester } from '../../lib/types'
import {
  formatShortDate,
  getDaysUntil,
  typeColor,
  typeLabel,
  weekNumber,
} from '../../lib/utils'

interface Props {
  event: Event
  course?: Course
  semester: Semester | null
  onToggle: (id: string, next: 'pending' | 'completed') => void
  onEdit?: (event: Event) => void
}

export default function EventCard({ event, course, semester, onToggle, onEdit }: Props) {
  const done = event.status === 'completed'
  const days = getDaysUntil(event.date)
  const wk = event.week_number ?? (event.date ? weekNumber(event.date, semester) : null)

  const daysLabel =
    days === null
      ? ''
      : days === 0
        ? 'Today'
        : days > 0
          ? `${days}d`
          : `${-days}d ago`

  const clickable = !!onEdit

  return (
    <div
      onClick={clickable ? () => onEdit!(event) : undefined}
      className={`p-3 rounded-xl bg-card border border-border transition-opacity ${
        done ? 'opacity-50' : ''
      } ${clickable ? 'cursor-pointer hover:bg-hover' : ''}`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggle(event.id, done ? 'pending' : 'completed')
          }}
          aria-label={done ? '标记未完成' : '标记完成'}
          className={`mt-0.5 w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${
            done
              ? 'bg-accent border-accent text-white'
              : 'border-muted hover:border-accent'
          }`}
        >
          {done ? <Check size={12} /> : null}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {course && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white"
                style={{ backgroundColor: course.color }}
              >
                {course.code}
              </span>
            )}
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${typeColor(event.type)}`}>
              {typeLabel(event.type)}
            </span>
            {event.is_group && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-500 font-medium flex items-center gap-0.5">
                <Users size={10} /> GROUP
              </span>
            )}
            {event.weight && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-hover text-dim">
                {event.weight}
              </span>
            )}
          </div>

          <div className={`text-sm font-medium text-text ${done ? 'line-through' : ''}`}>
            {event.title}
          </div>

          <div className="mt-1 flex items-center gap-2 text-xs text-dim flex-wrap">
            {event.date ? (
              <>
                <span className="inline-flex items-center gap-0.5">
                  {formatShortDate(event.date)}
                  {event.date_inferred && (
                    <AlertTriangle
                      size={10}
                      className="text-amber-500"
                      aria-label="日期为推断值"
                    />
                  )}
                </span>
                {event.time && <span>{event.time.slice(0, 5)}</span>}
                {wk !== null && <span>Week {wk}</span>}
                {days !== null && !done && (
                  <span
                    className={
                      days <= 3 && days >= 0
                        ? 'text-red-500 font-medium'
                        : days <= 7 && days >= 0
                          ? 'text-amber-500'
                          : ''
                    }
                  >
                    {daysLabel}
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted italic">未定日期</span>
            )}
          </div>

          {event.date_inferred && event.date_source && (
            <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-600">
              <AlertTriangle size={9} className="shrink-0" />
              <span>
                日期推断自 "<span className="italic">{event.date_source}</span>"，请核对
              </span>
            </div>
          )}

          {event.notes && <div className="mt-1 text-xs text-dim line-clamp-2">{event.notes}</div>}
        </div>

        <div className="flex items-center gap-1">
          {done && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onToggle(event.id, 'pending')
              }}
              aria-label="撤销完成"
              className="p-1.5 rounded hover:bg-hover text-muted"
            >
              <Undo2 size={14} />
            </button>
          )}
          {clickable && (
            <span className="p-1.5 text-muted" aria-hidden>
              <Pencil size={14} />
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
