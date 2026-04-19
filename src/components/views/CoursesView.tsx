import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSemester } from '../../hooks/useSemester'
import { useCourses } from '../../hooks/useCourses'
import { useEvents } from '../../hooks/useEvents'
import CourseCard from '../shared/CourseCard'
import CourseModal from '../shared/CourseModal'
import type { Course } from '../../lib/types'

export default function CoursesView() {
  const navigate = useNavigate()
  const { semester } = useSemester()
  const { courses, loading, reload: reloadCourses } = useCourses(semester?.id)
  const { events, reload: reloadEvents } = useEvents(semester?.id)
  const [editing, setEditing] = useState<Course | null>(null)

  const stats = useMemo(() => {
    const map = new Map<
      string,
      { pending: number; total: number; next: { title: string; date: string | null } | null }
    >()
    for (const c of courses) map.set(c.id, { pending: 0, total: 0, next: null })
    const today = new Date().toISOString().slice(0, 10)
    for (const e of events) {
      if (!e.course_id) continue
      const s = map.get(e.course_id)
      if (!s) continue
      s.total++
      if (e.status === 'pending') s.pending++
      if (e.date && e.date >= today && e.status === 'pending') {
        if (!s.next || (s.next.date && e.date < s.next.date)) {
          s.next = { title: e.title, date: e.date }
        }
      }
    }
    return map
  }, [courses, events])

  if (!semester) {
    return <div className="p-8 text-center text-dim">尚未创建学期。</div>
  }

  if (loading) return <div className="p-8 text-center text-dim">加载中…</div>

  if (courses.length === 0) {
    return (
      <div className="p-8 text-center text-dim">
        <p>暂无课程。</p>
        <p className="text-sm mt-2">前往 Add 页面添加课程。</p>
      </div>
    )
  }

  const editingCount = editing ? (stats.get(editing.id)?.total ?? 0) : 0

  return (
    <div className="p-4 space-y-3">
      <div className="text-xs text-dim">
        {semester.code} · {courses.length} 门课程
      </div>
      {courses.map((c) => {
        const s = stats.get(c.id) ?? { pending: 0, total: 0, next: null }
        return (
          <CourseCard
            key={c.id}
            course={c}
            pendingCount={s.pending}
            nextDeadline={s.next}
            onClick={() => navigate(`/courses/${c.id}`)}
            onEdit={setEditing}
          />
        )
      })}

      <CourseModal
        course={editing}
        eventCount={editingCount}
        onClose={() => setEditing(null)}
        onSaved={() => {
          reloadCourses()
          reloadEvents()
        }}
      />
    </div>
  )
}
