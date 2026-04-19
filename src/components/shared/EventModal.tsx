import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import Modal from './Modal'
import { supabase } from '../../lib/supabase'
import type { Course, Event, EventStatus, EventType } from '../../lib/types'

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

const STATUSES: { value: EventStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

interface Props {
  event: Event | null
  courses: Course[]
  onClose: () => void
  onSaved: () => void
}

export default function EventModal({ event, courses, onClose, onSaved }: Props) {
  const [courseId, setCourseId] = useState('')
  const [title, setTitle] = useState('')
  const [type, setType] = useState<EventType>('deadline')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [weight, setWeight] = useState('')
  const [isGroup, setIsGroup] = useState(false)
  const [status, setStatus] = useState<EventStatus>('pending')
  const [notes, setNotes] = useState('')
  const [dateInferred, setDateInferred] = useState(false)
  const [dateSource, setDateSource] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)

  useEffect(() => {
    if (!event) return
    setCourseId(event.course_id ?? '')
    setTitle(event.title)
    setType(event.type)
    setDate(event.date ?? '')
    setTime(event.time ? event.time.slice(0, 5) : '')
    setWeight(event.weight ?? '')
    setIsGroup(event.is_group)
    setStatus(event.status)
    setNotes(event.notes ?? '')
    setDateInferred(event.date_inferred)
    setDateSource(event.date_source)
    setErr(null)
    setConfirmDel(false)
  }, [event])

  // Manually editing the date means the user has confirmed it — clear the
  // inference flags so the warning badge disappears on save.
  const onDateChange = (v: string) => {
    if (event && v !== (event.date ?? '')) {
      setDateInferred(false)
      setDateSource(null)
    }
    setDate(v)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!event) return
    setSaving(true)
    setErr(null)
    const { error } = await supabase
      .from('events')
      .update({
        course_id: courseId || null,
        title,
        type,
        date: date || null,
        time: time || null,
        weight: weight || null,
        is_group: isGroup,
        status,
        notes: notes || null,
        date_inferred: dateInferred,
        date_source: dateSource,
        updated_at: new Date().toISOString(),
      })
      .eq('id', event.id)
    setSaving(false)
    if (error) {
      setErr(error.message)
      return
    }
    onSaved()
    onClose()
  }

  const del = async () => {
    if (!event) return
    setSaving(true)
    setErr(null)
    const { error } = await supabase.from('events').delete().eq('id', event.id)
    setSaving(false)
    if (error) {
      setErr(error.message)
      return
    }
    onSaved()
    onClose()
  }

  return (
    <Modal
      open={!!event}
      title="编辑事件"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {!confirmDel ? (
            <button
              type="button"
              onClick={() => setConfirmDel(true)}
              className="px-3 py-2.5 rounded-lg border border-red-500/40 text-red-500 hover:bg-red-500/10 text-sm font-medium flex items-center gap-1"
            >
              <Trash2 size={14} /> 删除
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setConfirmDel(false)}
                className="px-3 py-2.5 rounded-lg bg-card border border-border text-dim text-sm"
              >
                取消
              </button>
              <button
                type="button"
                onClick={del}
                disabled={saving}
                className="px-3 py-2.5 rounded-lg bg-red-500 text-white text-sm font-medium disabled:opacity-60"
              >
                确认删除
              </button>
            </>
          )}
          <button
            form="event-modal-form"
            type="submit"
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg bg-accent text-white text-sm font-medium disabled:opacity-60"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      }
    >
      <form id="event-modal-form" onSubmit={save} className="space-y-3">
        <Field label="课程">
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            className={inputCls}
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
          />
        </Field>

        <Field label="类型 *">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as EventType)}
            className={inputCls}
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
              onChange={(e) => onDateChange(e.target.value)}
              className={inputCls}
            />
            {dateInferred && dateSource && (
              <div className="mt-1 text-[10px] text-amber-600">
                日期推断自 "<span className="italic">{dateSource}</span>"，改动会清除该标记
              </div>
            )}
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

        <Field label="状态">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as EventStatus)}
            className={inputCls}
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
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
      </form>
    </Modal>
  )
}

const inputCls =
  'w-full px-3 py-2.5 rounded-lg bg-card border border-border text-text placeholder:text-muted focus:outline-none focus:border-accent text-sm'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-dim mb-1">{label}</div>
      {children}
    </label>
  )
}
