import { useRef, useState } from 'react'
import {
  Upload,
  FileText,
  Check,
  X,
  Trash2,
  Loader2,
  Image as ImageIcon,
  Plus,
} from 'lucide-react'
import { useClaude, type ParsedEvent } from '../../../hooks/useClaude'
import { useCalendar } from '../../../hooks/useCalendar'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import type { FileKind, ImportKind } from '../../../lib/fileParsers'
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

interface SelectedFile {
  file: File
  kind: ImportKind
}

type Phase =
  | { stage: 'idle' }
  | { stage: 'selected'; files: SelectedFile[] }
  | {
      stage: 'extracting'
      files: SelectedFile[]
      current: number
    }
  | {
      stage: 'parsing'
      files: SelectedFile[]
      chars: number
      hasImage: boolean
    }
  | { stage: 'review'; files: SelectedFile[]; primaryKind: ImportKind }
  | { stage: 'saving'; files: SelectedFile[]; primaryKind: ImportKind }

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
    setOkMsg(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const openPicker = () => {
    if (fileInputRef.current) fileInputRef.current.value = ''
    fileInputRef.current?.click()
  }

  const mergeSelection = async (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return
    setLocalErr(null)
    setOkMsg(null)
    const parsers = await loadParsers()

    const existing = phase.stage === 'selected' ? phase.files : []
    const existingKeys = new Set(
      existing.map((e) => `${e.file.name}|${e.file.size}`),
    )

    const processed: SelectedFile[] = [...existing]
    const errs: string[] = []

    for (const file of Array.from(incoming)) {
      const key = `${file.name}|${file.size}`
      if (existingKeys.has(key)) continue
      const kind = parsers.classifyFile(file)
      if (!kind) {
        errs.push(`${file.name}：不支持的格式`)
        continue
      }
      const sizeErr = parsers.checkSize(file, kind)
      if (sizeErr) {
        errs.push(`${file.name}：${sizeErr}`)
        continue
      }
      processed.push({ file, kind })
      existingKeys.add(key)
    }

    const imageCount = processed.filter((p) => p.kind === 'image').length
    if (imageCount > 1) {
      errs.push(
        `只能有 1 张图片（vision 限制），当前选了 ${imageCount} 张。请移除多余的图片。`,
      )
    }

    if (errs.length > 0) setLocalErr(errs.join('\n'))

    if (processed.length > 0) {
      setPhase({ stage: 'selected', files: processed })
    } else if (existing.length === 0) {
      setPhase({ stage: 'idle' })
    }
  }

  const removeFile = (idx: number) => {
    if (phase.stage !== 'selected') return
    const next = phase.files.filter((_, i) => i !== idx)
    if (next.length === 0) {
      reset()
    } else {
      setPhase({ stage: 'selected', files: next })
      // Re-validate image count in case removing fixes it
      const imageCount = next.filter((p) => p.kind === 'image').length
      if (imageCount <= 1) setLocalErr(null)
    }
  }

  const startParse = async () => {
    if (phase.stage !== 'selected') return
    const files = phase.files
    const imageCount = files.filter((f) => f.kind === 'image').length
    if (imageCount > 1) {
      setLocalErr('只能有 1 张图片，请先移除多余的图片。')
      return
    }
    setLocalErr(null)
    setOkMsg(null)
    setCandidates([])

    const parsers = await loadParsers()

    // Read everything
    let concatenated = ''
    let image: { base64: string; mediaType: string } | null = null
    try {
      for (let i = 0; i < files.length; i++) {
        setPhase({ stage: 'extracting', files, current: i })
        const sf = files[i]
        if (sf.kind === 'image') {
          image = await parsers.readImage(sf.file)
        } else {
          const ext = await parsers.extractText(sf.file)
          concatenated += `--- File: ${sf.file.name} ---\n${ext.text.trim()}\n\n`
        }
      }
    } catch (e) {
      setLocalErr(`读取文件失败：${e instanceof Error ? e.message : String(e)}`)
      setPhase({ stage: 'selected', files })
      return
    }

    const payloadText = concatenated.trim()
    if (!image && !payloadText) {
      setLocalErr('所有文件都没抽取到内容')
      setPhase({ stage: 'selected', files })
      return
    }

    // primaryKind chooses the source enum written to events and the hint
    // we send to Claude. Image wins when present (photo_import); otherwise
    // the first document's kind.
    const primaryKind: ImportKind = image
      ? 'image'
      : (files[0].kind as FileKind)

    setPhase({
      stage: 'parsing',
      files,
      chars: payloadText.length,
      hasImage: !!image,
    })

    try {
      let events: ParsedEvent[]
      if (image) {
        // Vision path: image + concatenated doc text as caption.
        events = await parseImage(
          image.base64,
          image.mediaType,
          payloadText,
          courses,
          calendar,
          semester,
        )
      } else {
        events = await parseFileText(
          payloadText,
          primaryKind as FileKind,
          courses,
          calendar,
          semester,
        )
      }
      setCandidates(events)
      setPhase({ stage: 'review', files, primaryKind })
      if (events.length === 0) {
        setLocalErr('Claude 没识别出事件')
      }
    } catch {
      // hook surfaces error
      setPhase({ stage: 'selected', files })
    }
  }

  const patch = (i: number, partial: Partial<ParsedEvent>) => {
    setCandidates((prev) =>
      prev.map((e, idx) => (idx === i ? { ...e, ...partial } : e)),
    )
  }

  const removeCandidate = (i: number) => {
    setCandidates((prev) => prev.filter((_, idx) => idx !== i))
  }

  const saveAll = async () => {
    if (!user || candidates.length === 0) return
    if (phase.stage !== 'review') return
    const { sourceFor } = await loadParsers()
    const source = sourceFor(phase.primaryKind)
    const sourceFile = phase.files.map((f) => f.file.name).join(' + ')
    const files = phase.files
    const primaryKind = phase.primaryKind
    setPhase({ stage: 'saving', files, primaryKind })
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
      source_file: sourceFile,
      status: 'pending' as const,
    }))
    const { error } = await supabase.from('events').insert(rows)
    if (error) {
      setLocalErr(error.message)
      setPhase({ stage: 'review', files, primaryKind })
      return
    }
    setOkMsg(`已从 ${files.length} 个文件导入 ${rows.length} 条事件。`)
    setCandidates([])
    reset()
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
        multiple
        accept=".pptx,.pdf,.docx,.png,.jpg,.jpeg,.webp,image/*"
        className="hidden"
        onChange={(e) => {
          mergeSelection(e.target.files)
        }}
      />

      {phase.stage === 'idle' && (
        <button
          type="button"
          onClick={openPicker}
          className="w-full p-4 rounded-xl bg-card border border-dashed border-border text-dim hover:border-accent hover:text-text transition-colors flex flex-col items-center gap-1 text-sm"
        >
          <Upload size={16} />
          <span>上传 .pptx / .pdf / .docx 或图片（可多选，同一门课的多个文件）</span>
          <span className="text-xs text-muted">
            文档 ≤10MB · 图片 ≤5MB · 最多 1 张图片
          </span>
        </button>
      )}

      {phase.stage === 'selected' && (
        <div className="space-y-2">
          <div className="text-xs text-dim flex items-center justify-between">
            <span>已选 {phase.files.length} 个文件</span>
            <button
              type="button"
              onClick={reset}
              className="text-dim hover:text-red-500"
            >
              全部清空
            </button>
          </div>
          <ul className="rounded-xl bg-card border border-border divide-y divide-border">
            {phase.files.map((sf, i) => (
              <li
                key={`${sf.file.name}|${sf.file.size}`}
                className="p-2.5 flex items-center gap-2 text-sm"
              >
                {sf.kind === 'image' ? (
                  <ImageIcon size={14} className="text-purple-500 shrink-0" />
                ) : (
                  <FileText size={14} className="text-accent shrink-0" />
                )}
                <span className="flex-1 min-w-0 truncate text-text">
                  {sf.file.name}
                </span>
                <span className="text-xs text-muted shrink-0">
                  {(sf.file.size / 1024).toFixed(0)} KB
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="p-1 rounded hover:bg-hover text-muted hover:text-red-500"
                  aria-label="移除文件"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={openPicker}
              className="px-3 py-2 rounded-lg bg-card border border-border text-dim hover:bg-hover text-xs flex items-center gap-1"
            >
              <Plus size={12} /> 添加更多
            </button>
            <button
              type="button"
              onClick={startParse}
              className="flex-1 py-2 rounded-lg bg-accent text-white text-xs font-medium"
            >
              开始解析
            </button>
          </div>
        </div>
      )}

      {isWorking && phase.stage !== 'idle' && phase.stage !== 'selected' && (
        <div className="p-4 rounded-xl bg-card border border-border flex items-center gap-3 text-sm">
          <Loader2 size={16} className="animate-spin text-accent shrink-0" />
          <div className="min-w-0 flex-1">
            {phase.stage === 'extracting' && (
              <>
                <div className="text-text truncate">
                  {phase.files[phase.current]?.file.name}
                </div>
                <div className="text-xs text-dim">
                  正在读取文件 {phase.current + 1} / {phase.files.length}…
                </div>
              </>
            )}
            {phase.stage === 'parsing' && (
              <>
                <div className="text-text">
                  {phase.files.length} 个文件
                  {phase.hasImage ? '（含图片）' : ''}
                </div>
                <div className="text-xs text-dim">
                  {phase.chars > 0
                    ? `${phase.chars.toLocaleString()} 字符文本`
                    : ''}
                  {phase.chars > 0 && phase.hasImage ? ' + ' : ''}
                  {phase.hasImage ? '1 张图片' : ''}
                  ，{phase.hasImage ? 'Claude vision' : 'Claude'} 解析中…
                </div>
              </>
            )}
            {phase.stage === 'saving' && (
              <div className="text-text">保存中…</div>
            )}
          </div>
        </div>
      )}

      {error && <div className="text-xs text-red-500 whitespace-pre-line">{error}</div>}
      {localErr && (
        <div className="text-xs text-red-500 whitespace-pre-line">{localErr}</div>
      )}
      {okMsg && <div className="text-xs text-emerald-500">{okMsg}</div>}

      {phase.stage === 'review' && candidates.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-dim flex items-center gap-1 min-w-0">
              {phase.primaryKind === 'image' ? (
                <ImageIcon size={12} className="shrink-0" />
              ) : (
                <FileText size={12} className="shrink-0" />
              )}
              <span className="truncate">
                {phase.files.length === 1
                  ? phase.files[0].file.name
                  : `${phase.files.length} 个文件`}
              </span>
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
                onRemove={() => removeCandidate(i)}
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
