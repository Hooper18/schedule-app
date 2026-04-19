import { useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import type { Course, EventType } from '../../../lib/types'

const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: 'deadline', label: 'DDL' },
  { value: 'exam', label: 'Exam' },
  { value: 'midterm', label: 'Midterm' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'lab_report', label: 'Lab Report' },
  { value: 'video_submission', label: 'Video' },
  { value: 'presentation', label: 'Presentation' },
  { value: 'tutorial', label: 'Tutorial' },
  { value: 'consultation', label: 'Consultation' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'revision', label: 'Revision' },
  { value: 'milestone', label: 'Milestone' },
]

interface Props {
  semesterId: string
  courses: Course[]
}

export default function AddEventForm({ semesterId, courses }: Props) {
  const { user } = useAuth()
  const [courseId, setCourseId] = useState<string>('')
  const [title, setTitle] = useState('')
  const [type, setType] = useState<EventType>('deadline')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [weight, setWeight] = useState('')
  const [isGroup, setIsGroup] = useState(false)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    setErr(null)
    setOk(false)
    const { error } = await supabase.from('events').insert({
      user_id: user.id,
      semester_id: semesterId,
      course_id: courseId || null,
      title,
      type,
      date: date || null,
      time: time || null,
      weight: weight || null,
      is_group: isGroup,
      notes: notes || null,
      source: 'manual',
      status: 'pending',
    })
    setSaving(false)
    if (error) {
      setErr(error.message)
      return
    }
    setOk(true)
    setTitle('')
    setDate('')
    setTime('')
    setWeight('')
    setIsGroup(false)
    setNotes('')
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="课程">
        <select
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          className={selectCls}
        >
          <option value="">（无关联课程）</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} {c.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="标题 *">
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputCls}
          placeholder="Quiz 3 / Assignment 2"
        />
      </Field>

      <Field label="类型 *">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as EventType)}
          className={selectCls}
        >
          {EVENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="日期">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="时间">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="权重">
        <input
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="e.g. 15%"
          className={inputCls}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm text-text">
        <input
          type="checkbox"
          checked={isGroup}
          onChange={(e) => setIsGroup(e.target.checked)}
          className="accent-accent"
        />
        Group assignment
      </label>

      <Field label="备注">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className={inputCls}
        />
      </Field>

      {err && <div className="text-sm text-red-500">{err}</div>}
      {ok && <div className="text-sm text-emerald-500">已添加。</div>}

      <button
        type="submit"
        disabled={saving}
        className="w-full py-3 rounded-lg bg-accent text-white font-medium disabled:opacity-60"
      >
        {saving ? '保存中…' : '保存事件'}
      </button>
    </form>
  )
}

const inputCls =
  'w-full px-3 py-2.5 rounded-lg bg-card border border-border text-text placeholder:text-muted focus:outline-none focus:border-accent text-sm'
const selectCls = inputCls + ' appearance-none'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-dim mb-1">{label}</div>
      {children}
    </label>
  )
}
