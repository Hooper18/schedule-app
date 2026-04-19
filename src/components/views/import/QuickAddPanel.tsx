import { useState } from 'react'
import { Sparkles, Check, X, Trash2 } from 'lucide-react'
import { useClaude, type ParsedEvent } from '../../../hooks/useClaude'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import type { Course, EventType, Semester } from '../../../lib/types'
import { typeLabel } from '../../../lib/utils'

const EVENT_TYPES: EventType[] = [
  'deadline',
  'exam',
  'midterm',
  'quiz',
  'lab_report',
  'video_submission',
  'presentation',
  'tutorial',
  'consultation',
  'holiday',
  'revision',
  'milestone',
]

interface Props {
  semester: Semester
  courses: Course[]
  onSaved: () => void
}

export default function QuickAddPanel({ semester, courses, onSaved }: Props) {
  const { user } = useAuth()
  const { parseEvents, loading, error } = useClaude()
  const [input, setInput] = useState('')
  const [candidates, setCandidates] = useState<ParsedEvent[]>([])
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  const run = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    setSaveErr(null)
    setOkMsg(null)
    try {
      const events = await parseEvents(input, courses, semester)
      setCandidates(events)
      if (events.length === 0) {
        setSaveErr('没有解析出事件，换个说法试试？')
      }
    } catch {
      // error surfaced via hook
    }
  }

  const patch = (i: number, partial: Partial<ParsedEvent>) => {
    setCandidates((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...partial } : e)))
  }

  const removeAt = (i: number) => {
    setCandidates((prev) => prev.filter((_, idx) => idx !== i))
  }

  const saveAll = async () => {
    if (!user || candidates.length === 0) return
    setSaving(true)
    setSaveErr(null)
    const rows = candidates.map((c) => ({
      user_id: user.id,
      semester_id: semester.id,
      course_id: c.course_id,
      title: c.title,
      type: c.type,
      date: c.date,
      time: c.time,
      weight: c.weight,
      is_group: c.is_group,
      notes: c.notes,
      source: 'nlp_input' as const,
      status: 'pending' as const,
    }))
    const { error } = await supabase.from('events').insert(rows)
    setSaving(false)
    if (error) {
      setSaveErr(error.message)
      return
    }
    setOkMsg(`已保存 ${rows.length} 条事件。`)
    setCandidates([])
    setInput('')
    onSaved()
  }

  return (
    <section className="space-y-3">
      <form onSubmit={run} className="flex items-center gap-2 p-2 rounded-xl bg-card border border-border focus-within:border-accent">
        <Sparkles size={16} className="text-accent shrink-0 ml-1" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="用自然语言描述：CS101 quiz 下周五 3pm 10%"
          className="flex-1 bg-transparent text-sm text-text placeholder:text-muted focus:outline-none"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium disabled:opacity-40"
        >
          {loading ? '解析中…' : '解析'}
        </button>
      </form>

      {error && <div className="text-xs text-red-500">{error}</div>}
      {saveErr && <div className="text-xs text-red-500">{saveErr}</div>}
      {okMsg && <div className="text-xs text-emerald-500">{okMsg}</div>}

      {candidates.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold tracking-wider text-muted uppercase">
              待确认 · {candidates.length}
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCandidates([])}
                className="px-2 py-1 rounded-lg text-xs text-dim hover:bg-hover flex items-center gap-1"
              >
                <X size={12} /> 全部丢弃
              </button>
              <button
                type="button"
                onClick={saveAll}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium disabled:opacity-60 flex items-center gap-1"
              >
                <Check size={12} /> {saving ? '保存中…' : '保存全部'}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {candidates.map((c, i) => (
              <CandidateCard
                key={i}
                value={c}
                courses={courses}
                onChange={(partial) => patch(i, partial)}
                onRemove={() => removeAt(i)}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

interface CardProps {
  value: ParsedEvent
  courses: Course[]
  onChange: (partial: Partial<ParsedEvent>) => void
  onRemove: () => void
}

function CandidateCard({ value, courses, onChange, onRemove }: CardProps) {
  return (
    <div className="p-3 rounded-xl bg-card border border-border space-y-2">
      <div className="flex items-start gap-2">
        <input
          value={value.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="flex-1 bg-transparent text-sm font-medium text-text focus:outline-none border-b border-transparent focus:border-accent"
        />
        <button
          type="button"
          onClick={onRemove}
          className="p-1 rounded hover:bg-hover text-muted hover:text-red-500"
          aria-label="移除"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <select
          value={value.course_id ?? ''}
          onChange={(e) => onChange({ course_id: e.target.value || null })}
          className={selectCls}
        >
          <option value="">（无课程）</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} {c.name}
            </option>
          ))}
        </select>

        <select
          value={value.type}
          onChange={(e) => onChange({ type: e.target.value as EventType })}
          className={selectCls}
        >
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {typeLabel(t)}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={value.date ?? ''}
          onChange={(e) => onChange({ date: e.target.value || null })}
          className={inputCls}
        />
        <input
          type="time"
          value={value.time ?? ''}
          onChange={(e) => onChange({ time: e.target.value || null })}
          className={inputCls}
        />
        <input
          value={value.weight ?? ''}
          onChange={(e) => onChange({ weight: e.target.value || null })}
          placeholder="权重"
          className={inputCls}
        />
        <label className="flex items-center gap-1.5 px-2 text-dim">
          <input
            type="checkbox"
            checked={value.is_group}
            onChange={(e) => onChange({ is_group: e.target.checked })}
            className="accent-accent"
          />
          Group
        </label>
      </div>

      {value.notes && (
        <textarea
          value={value.notes}
          onChange={(e) => onChange({ notes: e.target.value || null })}
          rows={2}
          className="w-full text-xs bg-main border border-border rounded px-2 py-1 text-dim focus:outline-none focus:border-accent"
        />
      )}
    </div>
  )
}

const inputCls =
  'px-2 py-1.5 rounded bg-main border border-border text-text placeholder:text-muted focus:outline-none focus:border-accent'
const selectCls = inputCls + ' appearance-none'
