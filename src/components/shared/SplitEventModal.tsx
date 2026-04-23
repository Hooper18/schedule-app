import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal'
import { supabase } from '../../lib/supabase'
import type { Event } from '../../lib/types'

interface Props {
  event: Event | null
  onClose: () => void
  // Called after a successful split (N inserts + 1 delete). Parent should
  // close itself and refresh its list.
  onSplit: () => void
}

interface RowDraft {
  title: string
  date: string
  time: string
  weight: string
}

// Parse the count marker at the end of a title. Supports:
//   "Quizzes (×3)"   → count 3, stripped "Quizzes"
//   "Quizzes (3)"    → count 3, stripped "Quizzes"
//   "Quizzes ×3"     → count 3, stripped "Quizzes"
//   "作业 （3）"     → count 3, stripped "作业"
// Markers must be at the end of the title so "CS101" won't be mis-parsed.
function detectCount(title: string): { count: number; stripped: string } {
  let m = title.match(/\s*[(（]\s*[×x]\s*(\d+)\s*[)）]\s*$/i)
  if (m) return { count: parseInt(m[1], 10), stripped: title.slice(0, m.index!).trim() }
  m = title.match(/\s*[(（]\s*(\d+)\s*[)）]\s*$/)
  if (m) return { count: parseInt(m[1], 10), stripped: title.slice(0, m.index!).trim() }
  m = title.match(/\s*[×x]\s*(\d+)\s*$/i)
  if (m) return { count: parseInt(m[1], 10), stripped: title.slice(0, m.index!).trim() }
  return { count: 2, stripped: title.trim() }
}

// Best-effort English de-pluralization so "Quizzes" auto-fills as "Quiz 1".
// Operates on the last whitespace-delimited token only (keeps Chinese /
// multi-word prefixes intact). Not linguistically perfect — user edits are
// expected to correct edge cases.
function singularize(phrase: string): string {
  const parts = phrase.split(/\s+/)
  if (parts.length === 0) return phrase
  const last = parts[parts.length - 1]
  const lower = last.toLowerCase()
  let head = last
  if (lower.endsWith('zzes')) head = last.slice(0, -3)
  else if (lower.endsWith('ies') && last.length > 3) head = last.slice(0, -3) + 'y'
  else if (
    lower.endsWith('sses') ||
    lower.endsWith('xes') ||
    lower.endsWith('ches') ||
    lower.endsWith('shes')
  )
    head = last.slice(0, -2)
  else if (lower.endsWith('s') && !lower.endsWith('ss')) head = last.slice(0, -1)
  parts[parts.length - 1] = head
  return parts.join(' ')
}

// Split a weight string ("15%" → 3) into the per-child share ("5%"), keeping
// the trailing % if the source had it. Rounds to 2dp; non-numeric weights
// are passed through unchanged.
function splitWeight(weight: string | null, count: number): string {
  if (!weight || count <= 0) return ''
  const m = weight.match(/([\d.]+)/)
  if (!m) return weight
  const total = parseFloat(m[1])
  if (isNaN(total)) return weight
  const each = total / count
  const rounded = Number(each.toFixed(2))
  return weight.includes('%') ? `${rounded}%` : String(rounded)
}

function buildRows(count: number, stem: string, event: Event): RowDraft[] {
  const base = singularize(stem) || '子事件'
  const perWeight = splitWeight(event.weight, count)
  const dateDefault = event.date ?? ''
  const timeDefault = event.time ? event.time.slice(0, 5) : ''
  const rows: RowDraft[] = []
  for (let i = 0; i < count; i++) {
    rows.push({
      title: `${base} ${i + 1}`,
      date: dateDefault,
      time: timeDefault,
      weight: perWeight,
    })
  }
  return rows
}

export default function SplitEventModal({ event, onClose, onSplit }: Props) {
  const [count, setCount] = useState(2)
  const [rows, setRows] = useState<RowDraft[]>([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const stem = useMemo(
    () => (event ? detectCount(event.title).stripped : ''),
    [event],
  )

  // Initialize count + rows from the event when the modal opens.
  useEffect(() => {
    if (!event) return
    const { count: detected, stripped } = detectCount(event.title)
    const initial = Math.min(Math.max(detected, 2), 30)
    setCount(initial)
    setRows(buildRows(initial, stripped, event))
    setErr(null)
  }, [event])

  const onCountChange = (raw: string) => {
    if (!event) return
    const n = parseInt(raw, 10)
    if (isNaN(n)) return
    const clamped = Math.min(Math.max(n, 2), 30)
    const perWeight = splitWeight(event.weight, clamped)
    setCount(clamped)
    setRows((prev) => {
      const next: RowDraft[] = []
      for (let i = 0; i < clamped; i++) {
        if (i < prev.length) {
          // Preserve any user edits to title/date/time; only refresh the
          // per-child weight share since it's a derived value.
          next.push({ ...prev[i], weight: perWeight })
        } else {
          next.push({
            title: `${singularize(stem) || '子事件'} ${i + 1}`,
            date: event.date ?? '',
            time: event.time ? event.time.slice(0, 5) : '',
            weight: perWeight,
          })
        }
      }
      return next
    })
  }

  const updateRow = (i: number, patch: Partial<RowDraft>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  const confirm = async () => {
    if (!event) return
    const cleaned = rows.map((r) => ({ ...r, title: r.title.trim() }))
    if (cleaned.some((r) => !r.title)) {
      setErr('每一条子事件都必须有标题')
      return
    }
    const titles = cleaned.map((r) => r.title)
    if (new Set(titles).size !== titles.length) {
      setErr('子事件标题不能重复')
      return
    }
    setSaving(true)
    setErr(null)
    const payloads = cleaned.map((r) => ({
      user_id: event.user_id,
      semester_id: event.semester_id,
      course_id: event.course_id,
      title: r.title,
      type: event.type,
      date: r.date || null,
      time: r.time || null,
      end_date: event.end_date,
      weight: r.weight || null,
      is_group: event.is_group,
      submission_platform: event.submission_platform,
      // New children start pending — splitting a completed "Quizzes" into
      // 3 individual quizzes shouldn't carry the completion status forward.
      status: 'pending' as const,
      source: event.source,
      source_file: event.source_file,
      notes: event.notes,
      sort_order: event.sort_order,
      date_inferred: false,
      date_source: null,
    }))
    // Insert first, then delete the original. Reverse order would leave us
    // with zero events if the insert failed after the delete.
    const { error: insertErr } = await supabase.from('events').insert(payloads)
    if (insertErr) {
      setSaving(false)
      setErr(insertErr.message)
      return
    }
    const { error: delErr } = await supabase
      .from('events')
      .delete()
      .eq('id', event.id)
    setSaving(false)
    if (delErr) {
      // Inserts already committed — surface the error but don't roll back;
      // the user can clean up the duplicate manually from the Todo view.
      setErr(`子事件已创建，但删除原事件失败：${delErr.message}`)
      return
    }
    onSplit()
  }

  return (
    <Modal
      open={!!event}
      title="拆分事件"
      onClose={onClose}
      size="2xl"
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-2.5 rounded-lg bg-card border border-border text-dim text-sm"
          >
            取消
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={saving || rows.length < 2}
            className="flex-1 py-2.5 rounded-lg bg-accent text-white text-sm font-medium disabled:opacity-60"
          >
            {saving ? '拆分中…' : `确认拆分（${count} 条）`}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="text-xs text-dim">
          从「<span className="text-text font-medium">{event?.title}</span>
          」拆出多条独立事件。原事件会被删除，其它字段（课程、类型、备注等）
          会复制到每条子事件。
        </div>

        <div className="flex items-end gap-3">
          <label className="block">
            <div className="text-xs text-dim mb-1">数量</div>
            <input
              type="number"
              min={2}
              max={30}
              value={count}
              onChange={(e) => onCountChange(e.target.value)}
              className={`${inputCls} w-20`}
              disabled={saving}
            />
          </label>
          {event?.weight && (
            <div className="text-[11px] text-dim pb-3">
              权重 {event.weight} 已平分到每条（可在下面手动调整）
            </div>
          )}
        </div>

        <div className="space-y-2 pt-1">
          {rows.map((r, i) => (
            <div
              key={i}
              className="p-3 rounded-lg border border-border bg-card space-y-2"
            >
              <div className="flex items-center gap-2">
                <span className="shrink-0 w-6 h-6 rounded-full bg-accent/15 text-accent text-xs font-semibold flex items-center justify-center">
                  {i + 1}
                </span>
                <input
                  value={r.title}
                  onChange={(e) => updateRow(i, { title: e.target.value })}
                  placeholder="标题"
                  className={`${inputCls} flex-1`}
                  disabled={saving}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="block">
                  <div className="text-[10px] text-dim mb-0.5">日期</div>
                  <input
                    type="date"
                    value={r.date}
                    onChange={(e) => updateRow(i, { date: e.target.value })}
                    className={inputCls}
                    disabled={saving}
                  />
                </label>
                <label className="block">
                  <div className="text-[10px] text-dim mb-0.5">时间</div>
                  <input
                    type="time"
                    value={r.time}
                    onChange={(e) => updateRow(i, { time: e.target.value })}
                    className={inputCls}
                    disabled={saving}
                  />
                </label>
                <label className="block">
                  <div className="text-[10px] text-dim mb-0.5">权重</div>
                  <input
                    value={r.weight}
                    onChange={(e) => updateRow(i, { weight: e.target.value })}
                    placeholder="e.g. 5%"
                    className={inputCls}
                    disabled={saving}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        {err && <div className="text-sm text-red-500">{err}</div>}
      </div>
    </Modal>
  )
}

const inputCls =
  'w-full px-3 py-2 rounded-lg bg-main border border-border text-text placeholder:text-muted focus:outline-none focus:border-accent text-sm'
