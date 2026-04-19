import { useRef, useState } from 'react'
import { Upload, FileText, Check, X, Trash2, Loader2, Image as ImageIcon } from 'lucide-react'
import { useClaude, type ParsedEvent } from '../../../hooks/useClaude'
import { useCalendar } from '../../../hooks/useCalendar'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import type { ImportKind } from '../../../lib/fileParsers'
import type { Course, EventType, Semester } from '../../../lib/types'
import { typeLabel } from '../../../lib/utils'

// Lazy-load the parsers — they pull in pdfjs-dist + mammoth + jszip (~1MB
// combined) which shouldn't hit the main bundle until the user uploads.
async function loadParsers() {
  return import('../../../lib/fileParsers')
}

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

type Phase =
  | { stage: 'idle' }
  | { stage: 'extracting'; name: string; kind: ImportKind }
  | { stage: 'parsing'; name: string; kind: ImportKind; chars: number }
  | { stage: 'review'; name: string; kind: ImportKind }
  | { stage: 'saving' }

interface Props {
  semester: Semester
  courses: Course[]
  onSaved: () => void
}

export default function FileImportPanel({ semester, courses, onSaved }: Props) {
  const { user } = useAuth()
  const { parseFileText, parseImage, loading, error } = useClaude()
  const { entries: calendar } = useCalendar(semester.id)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [phase, setPhase] = useState<Phase>({ stage: 'idle' })
  const [candidates, setCandidates] = useState<ParsedEvent[]>([])
  const [localErr, setLocalErr] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  const reset = () => {
    setPhase({ stage: 'idle' })
    setCandidates([])
    setLocalErr(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const onPick = async (file: File) => {
    setLocalErr(null)
    setOkMsg(null)
    setCandidates([])
    const parsers = await loadParsers()
    const kind = parsers.classifyFile(file)
    if (!kind) {
      setLocalErr('不支持的格式：.pptx / .pdf / .docx / .png / .jpg / .jpeg')
      return
    }
    const sizeErr = parsers.checkSize(file, kind)
    if (sizeErr) {
      setLocalErr(sizeErr)
      return
    }
    setPhase({ stage: 'extracting', name: file.name, kind })

    try {
      if (kind === 'image') {
        const img = await parsers.readImage(file)
        setPhase({
          stage: 'parsing',
          name: file.name,
          kind,
          chars: img.base64.length,
        })
        const events = await parseImage(
          img.base64,
          img.mediaType,
          '',
          courses,
          calendar,
          semester,
        )
        setCandidates(events)
        setPhase({ stage: 'review', name: file.name, kind })
        if (events.length === 0) {
          setLocalErr('Claude 没从图片里识别出事件')
        }
      } else {
        const extracted = await parsers.extractText(file)
        if (!extracted.text.trim()) {
          setLocalErr('文件里没抽取到任何文字')
          setPhase({ stage: 'idle' })
          return
        }
        setPhase({
          stage: 'parsing',
          name: file.name,
          kind,
          chars: extracted.text.length,
        })
        const events = await parseFileText(
          extracted.text,
          extracted.kind,
          courses,
          calendar,
          semester,
        )
        setCandidates(events)
        setPhase({ stage: 'review', name: file.name, kind })
        if (events.length === 0) {
          setLocalErr('Claude 没从文件里识别出事件')
        }
      }
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : String(e))
      setPhase({ stage: 'idle' })
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
    if (phase.stage !== 'review') return
    const { sourceFor } = await loadParsers()
    const source = sourceFor(phase.kind)
    const fileName = phase.name
    setPhase({ stage: 'saving' })
    setLocalErr(null)
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
      source,
      source_file: fileName,
      status: 'pending' as const,
    }))
    const { error } = await supabase.from('events').insert(rows)
    if (error) {
      setLocalErr(error.message)
      setPhase({ stage: 'review', name: fileName, kind: phase.kind })
      return
    }
    setOkMsg(`已从 ${fileName} 导入 ${rows.length} 条事件。`)
    setCandidates([])
    setPhase({ stage: 'idle' })
    if (fileInputRef.current) fileInputRef.current.value = ''
    onSaved()
  }

  const isWorking =
    phase.stage === 'extracting' ||
    phase.stage === 'parsing' ||
    phase.stage === 'saving' ||
    loading

  return (
    <section className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pptx,.pdf,.docx,.png,.jpg,.jpeg,.webp,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onPick(f)
        }}
      />

      {phase.stage === 'idle' && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full p-4 rounded-xl bg-card border border-dashed border-border text-dim hover:border-accent hover:text-text transition-colors flex flex-col items-center gap-1 text-sm"
        >
          <Upload size={16} />
          <span>上传 .pptx / .pdf / .docx 或图片截图</span>
          <span className="text-xs text-muted">文档 ≤10MB · 图片 ≤5MB</span>
        </button>
      )}

      {isWorking && phase.stage !== 'idle' && (
        <div className="p-4 rounded-xl bg-card border border-border flex items-center gap-3 text-sm">
          <Loader2 size={16} className="animate-spin text-accent shrink-0" />
          <div className="min-w-0 flex-1">
            {phase.stage === 'extracting' && (
              <>
                <div className="text-text truncate">{phase.name}</div>
                <div className="text-xs text-dim">
                  {phase.kind === 'image' ? '正在读取图片…' : '正在抽取文本…'}
                </div>
              </>
            )}
            {phase.stage === 'parsing' && (
              <>
                <div className="text-text truncate">{phase.name}</div>
                <div className="text-xs text-dim">
                  {phase.kind === 'image'
                    ? `图片已编码（${Math.round(phase.chars / 1024)}KB base64），Claude vision 识别中…`
                    : `${phase.chars.toLocaleString()} 字符，发给 Claude 解析中…`}
                </div>
              </>
            )}
            {phase.stage === 'saving' && <div className="text-text">保存中…</div>}
          </div>
        </div>
      )}

      {error && <div className="text-xs text-red-500">{error}</div>}
      {localErr && <div className="text-xs text-red-500">{localErr}</div>}
      {okMsg && <div className="text-xs text-emerald-500">{okMsg}</div>}

      {phase.stage === 'review' && candidates.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-dim flex items-center gap-1 min-w-0">
              {phase.kind === 'image' ? (
                <ImageIcon size={12} className="shrink-0" />
              ) : (
                <FileText size={12} className="shrink-0" />
              )}
              <span className="truncate">{phase.name}</span>
              <span className="shrink-0">· {candidates.length} 条</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={reset}
                className="px-2 py-1 rounded-lg text-xs text-dim hover:bg-hover flex items-center gap-1"
              >
                <X size={12} /> 全部丢弃
              </button>
              <button
                type="button"
                onClick={saveAll}
                className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium flex items-center gap-1"
              >
                <Check size={12} /> 保存全部
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {candidates.map((c, i) => (
              <FileCandidateCard
                key={i}
                value={c}
                courses={courses}
                onChange={(partial) => patch(i, partial)}
                onRemove={() => removeAt(i)}
              />
            ))}
          </div>
        </>
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

function FileCandidateCard({ value, courses, onChange, onRemove }: CardProps) {
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
