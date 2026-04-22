import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useSemester } from '../../hooks/useSemester'
import { useCourses } from '../../hooks/useCourses'
import { useEvents } from '../../hooks/useEvents'
import EventCard from '../shared/EventCard'
import EventModal from '../shared/EventModal'
import FilterBar from '../shared/FilterBar'
import type { Course, Event, EventType } from '../../lib/types'

type Filter = 'all' | EventType | 'ddl_group'
type GroupMode = 'time' | 'course'

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
  const [groupMode, setGroupMode] = useState<GroupMode>('time')

  const courseMap = useMemo(
    () => Object.fromEntries(courses.map((c) => [c.id, c])),
    [courses],
  )

  const filtered = useMemo(() => {
    const filterDef = FILTERS.find((f) => f.value === filter)
    const allowed = filterDef?.types
    return events.filter((e) => {
      if (!showDone && e.status === 'completed') return false
      if (e.status === 'cancelled') return false
      if (!allowed) return true
      return allowed.includes(e.type)
    })
  }, [events, filter, showDone])

  const { tbd, dated } = useMemo(() => {
    const tbd: Event[] = []
    const dated: Event[] = []
    for (const e of filtered) (e.date ? dated : tbd).push(e)
    return { tbd, dated }
  }, [filtered])

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
      {/* Group-mode pill switcher */}
      <div className="px-4 pt-3">
        <div className="inline-flex bg-card rounded-full p-1 border border-border">
          <button
            type="button"
            onClick={() => setGroupMode('time')}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
              groupMode === 'time'
                ? 'bg-accent text-white shadow-sm'
                : 'text-dim hover:text-text'
            }`}
          >
            按时间
          </button>
          <button
            type="button"
            onClick={() => setGroupMode('course')}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
              groupMode === 'course'
                ? 'bg-accent text-white shadow-sm'
                : 'text-dim hover:text-text'
            }`}
          >
            按课程
          </button>
        </div>
      </div>

      <FilterBar
        value={filter}
        onChange={setFilter}
        options={FILTERS.map((f) => ({ value: f.value, label: f.label }))}
      />

      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between text-xs text-dim">
          <div>
            {semester.code} · {filtered.length} events
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

        {groupMode === 'time' ? (
          <ByTime
            tbd={tbd}
            dated={dated}
            courseMap={courseMap}
            semester={semester}
            onToggle={setStatus}
            onEdit={setEditing}
          />
        ) : (
          <ByCourse
            events={filtered}
            courses={courses}
            semester={semester}
            onToggle={setStatus}
            onEdit={setEditing}
          />
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

interface ByTimeProps {
  tbd: Event[]
  dated: Event[]
  courseMap: Record<string, Course>
  semester: NonNullable<ReturnType<typeof useSemester>['semester']>
  onToggle: (id: string, status: 'pending' | 'completed') => void
  onEdit: (e: Event) => void
}

function ByTime({ tbd, dated, courseMap, semester, onToggle, onEdit }: ByTimeProps) {
  if (tbd.length === 0 && dated.length === 0) {
    return <div className="py-16 text-center text-dim">没有事件</div>
  }
  return (
    <>
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
                onToggle={onToggle}
                onEdit={onEdit}
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
                onToggle={onToggle}
                onEdit={onEdit}
              />
            ))}
          </div>
        </section>
      )}
    </>
  )
}

interface ByCourseProps {
  events: Event[]
  courses: Course[]
  semester: NonNullable<ReturnType<typeof useSemester>['semester']>
  onToggle: (id: string, status: 'pending' | 'completed') => void
  onEdit: (e: Event) => void
}

function ByCourse({ events, courses, semester, onToggle, onEdit }: ByCourseProps) {
  // Group by course_id; sort within each group by date (tbd last), and courses
  // by their original sort_order (preserved from the courses query).
  const groups = useMemo(() => {
    const m = new Map<string, Event[]>()
    for (const e of events) {
      const key = e.course_id ?? '__no_course__'
      const arr = m.get(key) ?? []
      arr.push(e)
      m.set(key, arr)
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        if (a.date && b.date) return a.date.localeCompare(b.date)
        if (a.date) return -1
        if (b.date) return 1
        return 0
      })
    }
    return m
  }, [events])

  const orderedCourses = [
    ...courses.filter((c) => groups.has(c.id)),
    // Events without a course come last in their own group.
  ]
  const noCourseEvents = groups.get('__no_course__') ?? []

  if (events.length === 0) {
    return <div className="py-16 text-center text-dim">没有事件</div>
  }

  return (
    <div className="space-y-2">
      {orderedCourses.map((c) => (
        <CourseGroup
          key={c.id}
          course={c}
          events={groups.get(c.id) ?? []}
          semester={semester}
          onToggle={onToggle}
          onEdit={onEdit}
        />
      ))}
      {noCourseEvents.length > 0 && (
        <CourseGroup
          course={null}
          events={noCourseEvents}
          semester={semester}
          onToggle={onToggle}
          onEdit={onEdit}
        />
      )}
    </div>
  )
}

interface CourseGroupProps {
  course: Course | null
  events: Event[]
  semester: NonNullable<ReturnType<typeof useSemester>['semester']>
  onToggle: (id: string, status: 'pending' | 'completed') => void
  onEdit: (e: Event) => void
}

function CourseGroup({ course, events, semester, onToggle, onEdit }: CourseGroupProps) {
  const [open, setOpen] = useState(true)
  const label = course ? `${course.code} · ${course.name}` : '其他（无课程）'
  const color = course?.color ?? '#6b7280'
  const pending = events.filter((e) => e.status !== 'completed').length

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-hover transition-colors"
      >
        {open ? (
          <ChevronDown size={14} className="text-dim shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-dim shrink-0" />
        )}
        <span
          className="w-1 h-5 rounded-full shrink-0"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        <span className="flex-1 min-w-0 text-left text-sm font-medium text-text truncate">
          {label}
        </span>
        <span className="shrink-0 text-xs text-dim">
          {pending > 0 ? `${pending} 待办` : '全部完成'} · {events.length}
        </span>
      </button>
      {open && (
        <div className="p-3 pt-0 space-y-2 border-t border-border">
          {events.map((e) => (
            <EventCard
              key={e.id}
              event={e}
              course={course ?? undefined}
              semester={semester}
              onToggle={onToggle}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </section>
  )
}
