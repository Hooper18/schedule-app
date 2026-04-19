import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Mail, Phone, MapPin } from 'lucide-react'
import Layout from '../components/layout/Layout'
import EventCard from '../components/shared/EventCard'
import EventModal from '../components/shared/EventModal'
import type { Event } from '../lib/types'
import { useSemester } from '../hooks/useSemester'
import { useCourses } from '../hooks/useCourses'
import { useEvents } from '../hooks/useEvents'

export default function CourseDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { semester } = useSemester()
  const { courses } = useCourses(semester?.id)
  const { events, setStatus, reload } = useEvents(semester?.id)
  const [editing, setEditing] = useState<Event | null>(null)

  const course = useMemo(() => courses.find((c) => c.id === id), [courses, id])
  const courseEvents = useMemo(
    () => events.filter((e) => e.course_id === id),
    [events, id],
  )

  const weightRows = useMemo(() => {
    const agg: Record<string, number> = {}
    for (const e of courseEvents) {
      if (!e.weight) continue
      const m = e.weight.match(/(\d+(?:\.\d+)?)\s*%/)
      if (!m) continue
      const pct = parseFloat(m[1])
      const key = labelForType(e.type)
      agg[key] = (agg[key] ?? 0) + pct
    }
    return Object.entries(agg).sort(([, a], [, b]) => b - a)
  }, [courseEvents])

  const totalWeight = weightRows.reduce((s, [, v]) => s + v, 0)

  if (!course) {
    return (
      <Layout title="Course" hideNav showBack onBack={() => navigate('/courses')}>
        <div className="p-8 text-center text-dim">未找到课程。</div>
      </Layout>
    )
  }

  return (
    <Layout
      title={course.code}
      hideNav
      showBack
      onBack={() => navigate('/courses')}
    >
      <div className="p-4 space-y-5">
        <section className="p-4 rounded-xl bg-card border border-border">
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0"
              style={{ backgroundColor: course.color }}
            >
              {course.code}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-text">{course.name}</div>
              {course.name_full && (
                <div className="text-xs text-dim truncate">{course.name_full}</div>
              )}
            </div>
          </div>
          {course.credit && (
            <div className="text-xs text-dim">学分：{course.credit}</div>
          )}
          {course.lecturer && (
            <div className="mt-2 pt-2 border-t border-border space-y-1 text-xs text-dim">
              <div className="text-text">{course.lecturer}</div>
              {course.lecturer_email && (
                <div className="flex items-center gap-1.5">
                  <Mail size={12} /> {course.lecturer_email}
                </div>
              )}
              {course.lecturer_phone && (
                <div className="flex items-center gap-1.5">
                  <Phone size={12} /> {course.lecturer_phone}
                </div>
              )}
              {course.office && (
                <div className="flex items-center gap-1.5">
                  <MapPin size={12} /> {course.office}
                </div>
              )}
            </div>
          )}
        </section>

        {weightRows.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold tracking-wider text-muted uppercase mb-2">
              Assessment 权重 ({totalWeight.toFixed(0)}%)
            </h3>
            <div className="bg-card border border-border rounded-xl divide-y divide-border">
              {weightRows.map(([label, pct]) => (
                <div key={label} className="p-3 flex items-center gap-3">
                  <div className="flex-1 text-sm text-text">{label}</div>
                  <div className="w-32 h-2 rounded-full bg-hover overflow-hidden">
                    <div
                      className="h-full"
                      style={{
                        width: `${Math.min(100, pct)}%`,
                        backgroundColor: course.color,
                      }}
                    />
                  </div>
                  <div className="text-sm text-dim w-12 text-right">{pct}%</div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h3 className="text-xs font-semibold tracking-wider text-muted uppercase mb-2">
            事件 ({courseEvents.length})
          </h3>
          {courseEvents.length === 0 ? (
            <div className="text-sm text-dim py-4 text-center bg-card rounded-lg border border-border">
              暂无事件
            </div>
          ) : (
            <div className="space-y-2">
              {courseEvents.map((e) => (
                <EventCard
                  key={e.id}
                  event={e}
                  course={course}
                  semester={semester}
                  onToggle={setStatus}
                  onEdit={setEditing}
                />
              ))}
            </div>
          )}
        </section>

        {course.consultation_hours && course.consultation_hours.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold tracking-wider text-muted uppercase mb-2">
              Consultation Hours
            </h3>
            <div className="bg-card border border-border rounded-xl divide-y divide-border">
              {course.consultation_hours.map((h, i) => (
                <div key={i} className="p-3 text-sm">
                  <div className="text-text">
                    {h.day ?? ''} {h.start ?? ''}
                    {h.end ? ` - ${h.end}` : ''}
                  </div>
                  {(h.location || h.note) && (
                    <div className="text-xs text-dim mt-0.5">
                      {h.location}
                      {h.location && h.note ? ' · ' : ''}
                      {h.note}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {course.notes && (
          <section>
            <h3 className="text-xs font-semibold tracking-wider text-muted uppercase mb-2">
              备注
            </h3>
            <div className="p-3 bg-card border border-border rounded-xl text-sm text-dim whitespace-pre-wrap">
              {course.notes}
            </div>
          </section>
        )}
      </div>

      <EventModal
        event={editing}
        courses={courses}
        onClose={() => setEditing(null)}
        onSaved={reload}
      />
    </Layout>
  )
}

function labelForType(t: string): string {
  const map: Record<string, string> = {
    exam: 'Final Exam',
    midterm: 'Midterm',
    quiz: 'Quiz',
    deadline: 'Assignment',
    lab_report: 'Lab',
    video_submission: 'Video',
    presentation: 'Presentation',
  }
  return map[t] ?? t
}
