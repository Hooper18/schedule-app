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
  AlertTriangle,
  Wallet,
} from 'lucide-react'
import {
  useClaude,
  ClaudeProxyError,
  type ParsedEvent,
} from '../../../hooks/useClaude'
import { useCalendar } from '../../../hooks/useCalendar'
import { useBalance } from '../../../hooks/useBalance'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import type { FileKind, ImportKind } from '../../../lib/fileParsers'
import type {
  Course,
  EventSource,
  EventType,
  Semester,
} from '../../../lib/types'
import { typeLabel } from '../../../lib/utils'
import {
  API_COST_MULTIPLIER,
  estimateCourseParseCostUsd,
  formatUSD,
  LOW_BALANCE_THRESHOLD_USD,
} from '../../../lib/balance'
import Modal from '../../shared/Modal'
import TopupModal from '../../TopupModal'

const IMPORT_SOURCES: EventSource[] = [
  'ppt_import',
  'pdf_import',
  'docx_import',
  'photo_import',
]

interface EventRow {
  user_id: string
  semester_id: string
  course_id: string | null
  title: string
  type: EventType
  date: string | null
  time: string | null
  weight: string | null
  is_group: boolean
  notes: string | null
  source: EventSource
  source_file: string
  status: 'pending'
  date_inferred: boolean
  date_source: string | null
}

interface Conflict {
  courseId: string
  courseLabel: string
  existingCount: number
}

interface PendingSave {
  rows: EventRow[]
  conflicts: Conflict[]
  dedupCount: number
  fileCount: number
  kind: ImportKind
}

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
  const { balance, reload: reloadBalance } = useBalance()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [phase, setPhase] = useState<Phase>({ stage: 'idle' })
  const [candidates, setCandidates] = useState<ParsedEvent[]>([])
  const [localErr, setLocalErr] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingSave | null>(null)
  const [topupOpen, setTopupOpen] = useState(false)
  const lowBalance = balance !== null && balance < LOW_BALANCE_THRESHOLD_USD

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

    // Display-only estimate for the insufficient-balance toast. Real
    // deduction is computed server-side in claude-proxy, not from this.
    const bytes = files.reduce((s, f) => s + f.file.size, 0)
    const estUsd = Number(
      (estimateCourseParseCostUsd(bytes, payloadText.length) * API_COST_MULTIPLIER)
        .toFixed(2),
    )

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
    } catch (e) {
      // Hook already set a generic error — overwrite with a user-actionable
      // one when the server specifically said the balance was too low.
      if (e instanceof ClaudeProxyError && e.stage === 'insufficient_balance') {
        setLocalErr(`需要 ${formatUSD(estUsd)}，余额不足，请充值后再试`)
      }
      setPhase({ stage: 'selected', files })
    } finally {
      // claude-proxy deducts on start and refunds on error / empty result —
      // either way the balance row may have moved, so force a refresh.
      reloadBalance()
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

  // Step 1: probe DB for existing file-import events on the courses we're
  // about to touch, then either proceed straight to save (no conflicts)
  // or surface a 替换/追加 confirmation dialog.
  const saveAll = async () => {
    if (!user || candidates.length === 0) return
    if (phase.stage !== 'review') return
    const { sourceFor } = await loadParsers()
    const source = sourceFor(phase.primaryKind)
    const sourceFile = phase.files.map((f) => f.file.name).join(' + ')
    const files = phase.files
    const primaryKind = phase.primaryKind
    setLocalErr(null)

    const rawRows: EventRow[] = candidates.map((c) => ({
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
      status: 'pending',
      date_inferred: c.date_inferred === true,
      date_source: c.date_source ?? null,
    }))

    // Dedup within this batch.
    const seen = new Set<string>()
    const rows: EventRow[] = []
    for (const r of rawRows) {
      const key = `${r.user_id}|${r.course_id ?? ''}|${r.title}|${r.date ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push(r)
    }
    const dedupCount = rawRows.length - rows.length

    // Probe for existing file-import events per affected course.
    const affectedCourseIds = Array.from(
      new Set(rows.map((r) => r.course_id).filter((v): v is string => !!v)),
    )
    let conflicts: Conflict[] = []
    if (affectedCourseIds.length > 0) {
      const { data: existing, error: qErr } = await supabase
        .from('events')
        .select('course_id')
        .eq('user_id', user.id)
        .eq('semester_id', semester.id)
        .in('course_id', affectedCourseIds)
        .in('source', IMPORT_SOURCES)
      if (qErr) {
        setLocalErr(`查已有导入事件失败：${qErr.message}`)
        return
      }
      const counts = new Map<string, number>()
      for (const e of existing ?? []) {
        const cid = e.course_id as string
        counts.set(cid, (counts.get(cid) ?? 0) + 1)
      }
      conflicts = Array.from(counts.entries())
        .filter(([, n]) => n > 0)
        .map(([courseId, n]) => {
          const c = courses.find((x) => x.id === courseId)
          return {
            courseId,
            courseLabel: c ? `${c.code} ${c.name}` : courseId,
            existingCount: n,
          }
        })
    }

    if (conflicts.length === 0) {
      // No prior imports on these courses → straight append.
      await executeSave(rows, 'append', [], {
        files,
        primaryKind,
        dedupCount,
      })
      return
    }

    // Otherwise pause and ask the user.
    setPending({
      rows,
      conflicts,
      dedupCount,
      fileCount: files.length,
      kind: primaryKind,
    })
  }

  // Step 2: actual save. 'replace' deletes prior *_import events on the
  // affected courses first, 'append' leans on the unique index to dedupe.
  const executeSave = async (
    rows: EventRow[],
    strategy: 'replace' | 'append',
    replaceCourseIds: string[],
    ctx: {
      files: SelectedFile[]
      primaryKind: ImportKind
      dedupCount: number
    },
  ) => {
    if (!user) return
    setPending(null)
    setPhase({ stage: 'saving', files: ctx.files, primaryKind: ctx.primaryKind })
    setLocalErr(null)

    let deleted = 0
    if (strategy === 'replace' && replaceCourseIds.length > 0) {
      const { error: delErr, count } = await supabase
        .from('events')
        .delete({ count: 'exact' })
        .eq('user_id', user.id)
        .eq('semester_id', semester.id)
        .in('course_id', replaceCourseIds)
        .in('source', IMPORT_SOURCES)
      if (delErr) {
        setLocalErr(`清理旧导入失败：${delErr.message}`)
        setPhase({
          stage: 'review',
          files: ctx.files,
          primaryKind: ctx.primaryKind,
        })
        return
      }
      deleted = count ?? 0
    }

    const { error } = await supabase.from('events').upsert(rows, {
      onConflict: 'user_id,course_id,title,date',
      ignoreDuplicates: false,
    })
    if (error) {
      setLocalErr(error.message)
      setPhase({
        stage: 'review',
        files: ctx.files,
        primaryKind: ctx.primaryKind,
      })
      return
    }

    const dupNote = ctx.dedupCount > 0 ? `（批内去重 ${ctx.dedupCount} 条）` : ''
    const msg =
      strategy === 'replace'
        ? `已从 ${ctx.files.length} 个文件保存 ${rows.length} 条事件${dupNote}，替换掉 ${deleted} 条旧导入。`
        : `已从 ${ctx.files.length} 个文件处理 ${rows.length} 条事件${dupNote}，按 (课程 + 标题 + 日期) 去重合并。`
    setOkMsg(msg)
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

      {/* Balance banner — mirrors MoodleImportPanel. AI 解析 will 402 from
          the server when the balance is insufficient, and that 402 is what
          flips `startParse` into its error branch. */}
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
          lowBalance
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-600'
            : 'bg-card border-border text-dim'
        }`}
      >
        <Wallet size={14} className="shrink-0" />
        <span className="flex-1">
          余额 {balance === null ? '…' : formatUSD(balance)}
          {lowBalance && '（余额不足，AI 解析将失败）'}
        </span>
        <button
          type="button"
          onClick={() => setTopupOpen(true)}
          className="text-[11px] px-2 py-0.5 rounded bg-accent text-white font-medium"
        >
          充值
        </button>
      </div>

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

      <ConflictModal
        pending={pending}
        onCancel={() => setPending(null)}
        onAppend={() =>
          pending &&
          executeSave(pending.rows, 'append', [], {
            files: phase.stage === 'review' ? phase.files : [],
            primaryKind: pending.kind,
            dedupCount: pending.dedupCount,
          })
        }
        onReplace={() =>
          pending &&
          executeSave(
            pending.rows,
            'replace',
            pending.conflicts.map((c) => c.courseId),
            {
              files: phase.stage === 'review' ? phase.files : [],
              primaryKind: pending.kind,
              dedupCount: pending.dedupCount,
            },
          )
        }
      />
      {topupOpen && <TopupModal onClose={() => setTopupOpen(false)} />}
    </section>
  )
}

interface ConflictModalProps {
  pending: PendingSave | null
  onCancel: () => void
  onAppend: () => void
  onReplace: () => void
}

function ConflictModal({ pending, onCancel, onAppend, onReplace }: ConflictModalProps) {
  return (
    <Modal
      open={!!pending}
      title="课程已有导入事件"
      onClose={onCancel}
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-2.5 rounded-lg bg-card border border-border text-dim text-sm"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onAppend}
            className="px-3 py-2.5 rounded-lg bg-card border border-border text-text text-sm font-medium"
          >
            追加
          </button>
          <button
            type="button"
            onClick={onReplace}
            className="flex-1 py-2.5 rounded-lg bg-red-500 text-white text-sm font-medium"
          >
            替换
          </button>
        </div>
      }
    >
      {pending && (
        <div className="space-y-3 text-sm">
          <div className="text-text">
            检测到以下课程已有来自文件导入的事件：
          </div>
          <ul className="rounded-lg bg-card border border-border divide-y divide-border">
            {pending.conflicts.map((c) => (
              <li key={c.courseId} className="p-2.5 flex justify-between gap-2">
                <span className="text-text truncate">{c.courseLabel}</span>
                <span className="text-xs text-amber-600 shrink-0">
                  已有 {c.existingCount} 条
                </span>
              </li>
            ))}
          </ul>
          <div className="text-xs text-dim leading-relaxed space-y-1">
            <div>
              <span className="text-red-500 font-medium">替换</span>
              ：删掉这些课程下所有 <code>ppt_import / pdf_import /
              docx_import / photo_import</code> 来源的旧事件，然后插入本次
              新事件。手动 / 快速添加 / 其他课程的事件不受影响。
            </div>
            <div>
              <span className="text-text font-medium">追加</span>
              ：保留旧事件，按 (课程 + 标题 + 日期) 去重合并；同键会被新值
              覆盖。
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

interface CardProps {
  value: ParsedEvent
  courses: Course[]
  onChange: (partial: Partial<ParsedEvent>) => void
  onRemove: () => void
}

function FileCandidateCard({ value, courses, onChange, onRemove }: CardProps) {
  const inferred = value.date_inferred === true && !!value.date
  return (
    <div
      className={`p-3 rounded-xl bg-card border space-y-2 ${
        inferred ? 'border-amber-500/40' : 'border-border'
      }`}
    >
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

        <div className="relative">
          <input
            type="date"
            value={value.date ?? ''}
            onChange={(e) =>
              onChange({
                date: e.target.value || null,
                // User-edited dates are no longer inferred.
                date_inferred: false,
                date_source: null,
              })
            }
            className={`${inputCls} ${inferred ? 'pr-7 border-amber-500/60' : ''}`}
          />
          {inferred && (
            <AlertTriangle
              size={12}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-500 pointer-events-none"
              aria-label="日期从周数推断"
            />
          )}
        </div>
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

      {inferred && (
        <div className="flex items-center gap-1 text-[11px] text-amber-600">
          <AlertTriangle size={10} className="shrink-0" />
          <span>
            日期由 Claude 推断自
            <span className="italic">
              {value.date_source ? ` "${value.date_source}"` : ' 周数引用'}
            </span>
            ，请核对
          </span>
        </div>
      )}

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
