import { useMemo, useState } from 'react'
import { useSemester } from '../../hooks/useSemester'
import { useCourses } from '../../hooks/useCourses'
import { useEvents } from '../../hooks/useEvents'
import EventCard from '../shared/EventCard'
import EventModal from '../shared/EventModal'
import FilterBar from '../shared/FilterBar'
import type { Event, EventType } from '../../lib/types'

type Filter = 'all' | EventType | 'ddl_group'

const FILTERS: { value: Filter; label: string; types: EventType[] | null }[] = [
  { value: 'all', label: 'All', types: null },
  { value: 'exam', label: 'Exam', types: ['exam', 'midterm'] },
  { value: 'quiz', label: 'Quiz', types: ['quiz'] },
  { value: 'ddl_group', label: 'DDL', types: ['deadline', 'presentation'] },
  { value: 'lab_report', label: 'Lab', types: ['lab_report'] },
  { value: 'video_submission', label: 'Video', types: ['video_submission'] },
  { value: 'holiday', label: 'Holiday', types: ['holiday', 'revision'] },
]

export default function TimelineView() {
  const { semester } = useSemester()
  const { courses } = useCourses(semester?.id)
  const { events, loading, setStatus, reload } = useEvents(semester?.id)
  const [filter, setFilter] = useState<Filter>('all')
  const [showDone, setShowDone] = useState(false)
  const [editing, setEditing] = useState<Event | null>(null)

  const courseMap = useMemo(
    () => Object.fromEntries(courses.map((c) => [c.id, c])),
    [courses],
  )

  const { tbd, dated } = useMemo(() => {
    const filterDef = FILTERS.find((f) => f.value === filter)
    const allowed = filterDef?.types
    const pool = events.filter((e) => {
      if (!showDone && e.status === 'completed') return false
      if (e.status === 'cancelled') return false
      if (!allowed) return true
      return allowed.includes(e.type)
    })
    const tbd: Event[] = []
    const dated: Event[] = []
    for (const e of pool) (e.date ? dated : tbd).push(e)
    return { tbd, dated }
  }, [events, filter, showDone])

  if (!semester) {
    return (
      <div className="p-8 text-center text-dim">
        <p>尚未创建学期。</p>
        <p className="text-sm mt-2">请先到 Supabase 添加一条 semesters 记录。</p>
      </div>
    )
  }

  if (loading) return <div className="p-8 text-center text-dim">加载中…</div>

  return (
    <>
      <FilterBar
        value={filter}
        onChange={setFilter}
        options={FILTERS.map((f) => ({ value: f.value, label: f.label }))}
      />

      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between text-xs text-dim">
          <div>
            {semester.code} · {dated.length + tbd.length} events
          </div>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(e) => setShowDone(e.target.checked)}
              className="accent-accent"
            />
            显示已完成
          </label>
        </div>

        {tbd.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold tracking-wider text-emerald-500">
              📋 待定日期 · {tbd.length} 条
            </h2>
            <div className="space-y-2">
              {tbd.map((e) => (
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
          </section>
        )}

        {dated.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">
              Upcoming ({dated.length})
            </h2>
            <div className="space-y-2">
              {dated.map((e) => (
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
          </section>
        )}

        {tbd.length === 0 && dated.length === 0 && (
          <div className="py-16 text-center text-dim">没有事件</div>
        )}
      </div>

      <EventModal
        event={editing}
        courses={courses}
        onClose={() => setEditing(null)}
        onSaved={reload}
      />
    </>
  )
}
