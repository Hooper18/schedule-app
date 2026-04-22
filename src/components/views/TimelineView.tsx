import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Link2 } from 'lucide-react'
import { useSemester } from '../../hooks/useSemester'
import { useCourses } from '../../hooks/useCourses'
import { useEvents } from '../../hooks/useEvents'
import EventCard from '../shared/EventCard'
import EventModal from '../shared/EventModal'
import FilterBar from '../shared/FilterBar'
import ReassignCourseModal from '../ReassignCourseModal'
import type { Course, Event, EventType } from '../../lib/types'

// Matches course codes like COM104, BSC124, MPU3312, ECS301A.
const COURSE_CODE_RE = /\b[A-Z]{2,4}\d{3,}[A-Z]?\b/

function extractCourseCode(e: Event): string | null {
  const m =
    e.title.match(COURSE_CODE_RE) ||
    (e.notes ? e.notes.match(COURSE_CODE_RE) : null) ||
    (e.source_file ? e.source_file.match(COURSE_CODE_RE) : null)
  return m ? m[0] : null
}

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
  const [reassign, setReassign] = useState<{
    eventIds: string[]
    hintCode: string | null
  } | null>(null)
  // "All groups" broadcast: flipping `defaultOpen` + bumping `epoch` forces
  // every CourseGroup to re-sync to the new open state. Local per-group
  // toggles afterwards remain independent until the next broadcast.
  const [groupBroadcast, setGroupBroadcast] = useState({
    epoch: 0,
    defaultOpen: true,
  })

  const toggleAllGroups = () =>
    setGroupBroadcast((prev) => ({
      epoch: prev.epoch + 1,
      defaultOpen: !prev.defaultOpen,
    }))

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
        <div className="flex items-center justify-between gap-3 text-xs text-dim">
          <div className="shrink-0">
            {semester.code} · {filtered.length} events
          </div>
          <div className="flex items-center gap-3">
            {groupMode === 'course' && (
              <button
                type="button"
                onClick={toggleAllGroups}
                className="flex items-center gap-1 text-dim hover:text-text transition-colors"
                title={groupBroadcast.defaultOpen ? '全部收起' : '全部展开'}
              >
                {groupBroadcast.defaultOpen ? (
                  <>
                    <ChevronsDownUp size={13} />
                    <span>全部收起</span>
                  </>
                ) : (
                  <>
                    <ChevronsUpDown size={13} />
                    <span>全部展开</span>
                  </>
                )}
              </button>
            )}
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
            onReassign={(eventIds, hintCode) =>
              setReassign({ eventIds, hintCode })
            }
            groupBroadcast={groupBroadcast}
          />
        )}
      </div>

      <EventModal
        event={editing}
        courses={courses}
        onClose={() => setEditing(null)}
        onSaved={reload}
      />

      <ReassignCourseModal
        open={!!reassign}
        onClose={() => setReassign(null)}
        courses={courses}
        eventIds={reassign?.eventIds ?? []}
        hintCode={reassign?.hintCode ?? null}
        onDone={reload}
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
  onReassign: (eventIds: string[], hintCode: string | null) => void
  groupBroadcast: { epoch: number; defaultOpen: boolean }
}

function ByCourse({
  events,
  courses,
  semester,
  onToggle,
  onEdit,
  onReassign,
  groupBroadcast,
}: ByCourseProps) {
  // Group by course_id; sort within each group by date (tbd last), and courses
  // by their original sort_order (preserved from the courses query).
  const { byCourse, noCourse } = useMemo(() => {
    const byCourse = new Map<string, Event[]>()
    const noCourse: Event[] = []
    for (const e of events) {
      if (e.course_id) {
        const arr = byCourse.get(e.course_id) ?? []
        arr.push(e)
        byCourse.set(e.course_id, arr)
      } else {
        noCourse.push(e)
      }
    }
    const sortByDate = (arr: Event[]) =>
      arr.sort((a, b) => {
        if (a.date && b.date) return a.date.localeCompare(b.date)
        if (a.date) return -1
        if (b.date) return 1
        return 0
      })
    for (const arr of byCourse.values()) sortByDate(arr)
    sortByDate(noCourse)
    return { byCourse, noCourse }
  }, [events])

  // Subgroup the "no course" bucket by a course code extracted from
  // title/notes/source_file. Lets the user reassign all BSC124 events at
  // once, which is the usual case when Moodle/AC codes don't match.
  const noCourseSubgroups = useMemo(() => {
    const m = new Map<string, Event[]>()
    for (const e of noCourse) {
      const code = extractCourseCode(e) ?? '__unknown__'
      const arr = m.get(code) ?? []
      arr.push(e)
      m.set(code, arr)
    }
    // Sort: known codes alphabetically, unknown last.
    return Array.from(m.entries()).sort(([a], [b]) => {
      if (a === '__unknown__') return 1
      if (b === '__unknown__') return -1
      return a.localeCompare(b)
    })
  }, [noCourse])

  // Show every course in the semester, even with no events, so the user has
  // a stable complete list rather than a list that shrinks/grows with DDL
  // activity. Courses keep their original sort_order (preserved from the
  // courses query).
  const orderedCourses = courses

  if (events.length === 0 && orderedCourses.length === 0) {
    return <div className="py-16 text-center text-dim">没有事件</div>
  }

  return (
    <div className="space-y-2">
      {orderedCourses.map((c) => {
        const evs = byCourse.get(c.id) ?? []
        return (
          <CourseGroup
            key={c.id}
            title={`${c.code} · ${c.name}`}
            color={c.color}
            events={evs}
            course={c}
            semester={semester}
            onToggle={onToggle}
            onEdit={onEdit}
            onReassign={() =>
              onReassign(
                evs.map((e) => e.id),
                c.code,
              )
            }
            broadcast={groupBroadcast}
          />
        )
      })}

      {noCourse.length > 0 && (
        <section className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-3 px-3 py-2.5 border-b border-border">
            <span
              className="w-1 h-5 rounded-full shrink-0"
              style={{ backgroundColor: '#6b7280' }}
              aria-hidden
            />
            <span className="flex-1 min-w-0 text-sm font-medium text-text truncate">
              其他（无课程）
            </span>
            <span className="shrink-0 text-xs text-dim">
              {noCourse.length} 条
            </span>
          </div>
          <div className="p-3 space-y-3">
            {noCourseSubgroups.map(([code, evs]) => {
              const hint = code === '__unknown__' ? null : code
              const label =
                code === '__unknown__' ? '课程代码未识别' : code
              return (
                <div
                  key={code}
                  className="rounded-lg border border-border bg-main overflow-hidden"
                >
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                    <span className="flex-1 min-w-0 text-xs font-mono font-semibold text-text truncate">
                      {label}
                    </span>
                    <span className="text-[11px] text-dim shrink-0">
                      {evs.length} 条
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onReassign(
                          evs.map((e) => e.id),
                          hint,
                        )
                      }
                      className="shrink-0 inline-flex items-center gap-1 text-xs text-accent hover:bg-accent/10 rounded-md px-2 py-1 transition-colors"
                    >
                      <Link2 size={12} />
                      关联到课程
                    </button>
                  </div>
                  <div className="p-2 space-y-2">
                    {evs.map((e) => (
                      <EventCard
                        key={e.id}
                        event={e}
                        semester={semester}
                        onToggle={onToggle}
                        onEdit={onEdit}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

interface CourseGroupProps {
  title: string
  color: string
  course: Course
  events: Event[]
  semester: NonNullable<ReturnType<typeof useSemester>['semester']>
  onToggle: (id: string, status: 'pending' | 'completed') => void
  onEdit: (e: Event) => void
  onReassign: () => void
  broadcast: { epoch: number; defaultOpen: boolean }
}

function CourseGroup({
  title,
  color,
  course,
  events,
  semester,
  onToggle,
  onEdit,
  onReassign,
  broadcast,
}: CourseGroupProps) {
  const [open, setOpen] = useState(broadcast.defaultOpen)
  // React to "expand/collapse all" broadcasts. Ignore `defaultOpen` change
  // alone — only an epoch bump means the user clicked the global toggle, so
  // local manual toggles aren't clobbered by unrelated parent re-renders.
  useEffect(() => {
    setOpen(broadcast.defaultOpen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [broadcast.epoch])
  const pending = events.filter((e) => e.status !== 'completed').length

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="w-full flex items-center gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 min-w-0 flex items-center gap-3 text-left hover:opacity-80 transition-opacity"
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
          <span className="flex-1 min-w-0 text-sm font-medium text-text truncate">
            {title}
          </span>
          <span className="shrink-0 text-xs text-dim">
            {pending > 0 ? `${pending} 待办` : '全部完成'} · {events.length}
          </span>
        </button>
        <button
          type="button"
          onClick={onReassign}
          className="shrink-0 p-1.5 rounded-md text-dim hover:text-accent hover:bg-accent/10 transition-colors"
          title="批量关联到其他课程"
          aria-label="批量关联到其他课程"
        >
          <Link2 size={14} />
        </button>
      </div>
      {open && (
        <div className="p-3 pt-0 space-y-2 border-t border-border">
          {events.length === 0 ? (
            <div className="py-6 text-center text-xs text-dim">
              暂无待办
            </div>
          ) : (
            events.map((e) => (
              <EventCard
                key={e.id}
                event={e}
                course={course}
                semester={semester}
                onToggle={onToggle}
                onEdit={onEdit}
              />
            ))
          )}
        </div>
      )}
    </section>
  )
}
