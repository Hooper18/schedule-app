import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Paperclip,
  Pencil,
  RotateCcw,
  Sparkles,
  Triangle,
  Wallet,
} from 'lucide-react'
import Modal from '../../shared/Modal'
import TopupModal from '../../TopupModal'
import type { Course, EventSource, EventType, Semester } from '../../../lib/types'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import { useClaude } from '../../../hooks/useClaude'
import { useCalendar } from '../../../hooks/useCalendar'
import { useBalance } from '../../../hooks/useBalance'
import {
  deductBalance,
  estimateCourseParseCostUsd,
  formatCNY,
  LOW_BALANCE_THRESHOLD_CNY,
  refundBalance,
  usdToCny,
} from '../../../lib/balance'
import type { FileKind } from '../../../lib/fileParsers'

// Lazy-load fileParsers — same trick as FileImportPanel to keep the ~1MB
// pdfjs/mammoth/jszip bundle out of the main chunk.
async function loadParsers() {
  return import('../../../lib/fileParsers')
}

export interface MoodleEvent {
  title: string
  type: EventType
  date: string | null
  time: string | null
  notes: string | null
  weight?: string | null
  is_group?: boolean
  date_inferred?: boolean
  date_source?: string | null
  // Layer 2 marker — Claude-produced events carry this flag so the UI can
  // tint them and doImport can pick the right `source` column value.
  is_layer2?: boolean
}

export interface MoodleFile {
  name: string
  url: string
}

export interface MoodleDownloadedFile {
  name: string
  data: string
  mime: string
  size: number
}

export interface MoodleInlineImage {
  data: string
  mime: string
}

export interface MoodlePageContent {
  text: string
  images: MoodleInlineImage[]
}

export interface MoodleCourse {
  course_code: string | null
  course_name: string
  course_url?: string
  events: MoodleEvent[]
  files: MoodleFile[]
  // Layer 2 optional fields. Absent in legacy (Layer 1-only) payloads.
  page_content?: MoodlePageContent
  downloaded_files?: MoodleDownloadedFile[]
}

interface Props {
  semester: Semester
  courses: Course[]
  moodleData: MoodleCourse[] | null
  onSaved: () => void
  onGoToCoursesTab?: () => void
}

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

interface Pending {
  rows: EventRow[]
  conflicts: Conflict[]
  dedupCount: number
}

// Reconstruct a File from the base64 payload that content.js wrote to
// chrome.storage. Used to drive extractText (which wants a File to sniff
// kind and arrayBuffer).
function base64ToFile(base64: string, name: string, mime: string): File {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], name, { type: mime })
}

function typeBadgeClass(type: EventType): string {
  switch (type) {
    case 'deadline':
      return 'bg-sky-500/15 text-sky-500'
    case 'quiz':
      return 'bg-purple-500/15 text-purple-500'
    case 'exam':
    case 'midterm':
      return 'bg-red-500/15 text-red-500'
    case 'lab_report':
      return 'bg-amber-500/15 text-amber-500'
    case 'presentation':
      return 'bg-pink-500/15 text-pink-500'
    case 'video_submission':
      return 'bg-orange-500/15 text-orange-500'
    default:
      return 'bg-hover text-dim'
  }
}

function typeBadgeLabel(type: EventType): string {
  switch (type) {
    case 'deadline':
      return 'DDL'
    case 'quiz':
      return 'Quiz'
    case 'exam':
      return 'Exam'
    case 'midterm':
      return 'Midterm'
    case 'lab_report':
      return 'Lab'
    case 'presentation':
      return 'Pres.'
    case 'video_submission':
      return 'Video'
    default:
      return type
  }
}

const MOODLE_SOURCE: EventSource = 'moodle_scan'
// Layer 2 writes file-import sources too, so conflict detection and
// replace-scope need to cover all of them. FileImportPanel events end up in
// this bucket too — the policy is "re-import wipes the autoimport family".
const MOODLE_IMPORT_SOURCES: EventSource[] = [
  'moodle_scan',
  'ppt_import',
  'pdf_import',
  'docx_import',
  'photo_import',
]

interface AICourseState {
  status: 'running' | 'success' | 'error' | 'insufficient_balance'
  newEvents: MoodleEvent[]
  source: EventSource
  sourceFile: string
  error?: string
  // Amount pre-deducted in CNY. Kept so error paths can refund the exact
  // amount that was charged up front.
  deductedCny?: number
}

export default function MoodleImportPanel({
  semester,
  courses,
  moodleData,
  onSaved,
  onGoToCoursesTab,
}: Props) {
  const { user } = useAuth()
  const { parseFileText, parseImage } = useClaude()
  const { entries: calendar } = useCalendar(semester.id)
  const { balance, reload: reloadBalance } = useBalance()
  const [topupOpen, setTopupOpen] = useState(false)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [filesOpen, setFilesOpen] = useState<Record<number, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  // overrideCodes[ci] === undefined → use Moodle-extracted code (auto-match);
  // overrideCodes[ci] === ''        → user explicitly picked "不匹配任何课程"
  //                                    from the dropdown (force course_id=null);
  // overrideCodes[ci] === 'COM104'  → user picked that course from the dropdown.
  const [overrideCodes, setOverrideCodes] = useState<Record<number, string>>({})
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  // Per-course AI parse state keyed by course index.
  const [aiState, setAIState] = useState<Record<number, AICourseState>>({})
  // Prevents double-triggering AI parse for the same course when React 18's
  // StrictMode double-fires useEffect in dev.
  const aiStartedRef = useRef<Set<number>>(new Set())

  const runAIParse = useCallback(
    async (ci: number, mc: MoodleCourse) => {
      // Pre-deduct based on a rough upper-bound estimate. Billing happens
      // here (not at import-save time) because the cost is incurred by the
      // Claude API call, regardless of whether the user later keeps the
      // events. Refunded in the catch block if the call fails.
      const bytes = (mc.downloaded_files ?? []).reduce(
        (s, f) => s + (f.size ?? 0),
        0,
      )
      const chars = mc.page_content?.text?.length ?? 0
      const costUsd = estimateCourseParseCostUsd(bytes, chars)
      const costCny = Number(usdToCny(costUsd).toFixed(2))
      const description = `Moodle 课件 AI 解析：${mc.course_code ?? mc.course_name ?? '未命名'}`

      const deduct = await deductBalance(costCny, description)
      if (!deduct.ok) {
        const isInsufficient = deduct.message?.includes('insufficient balance')
        setAIState((prev) => ({
          ...prev,
          [ci]: {
            status: isInsufficient ? 'insufficient_balance' : 'error',
            newEvents: [],
            source: 'moodle_scan',
            sourceFile: 'moodle_scan',
            error: isInsufficient
              ? `需要 ${formatCNY(costCny)}，余额不足`
              : deduct.message || '扣费失败',
          },
        }))
        reloadBalance()
        return
      }
      reloadBalance()

      setAIState((prev) => ({
        ...prev,
        [ci]: {
          status: 'running',
          newEvents: [],
          source: 'moodle_scan',
          sourceFile: 'moodle_scan',
          deductedCny: costCny,
        },
      }))
      try {
        const parsers = await loadParsers()

        // Extract text from downloaded files.
        let combinedText = ''
        let primaryKind: FileKind | null = null
        const downloaded = mc.downloaded_files ?? []
        const fileNames: string[] = []
        for (const f of downloaded) {
          try {
            const file = base64ToFile(f.data, f.name, f.mime)
            const kind = parsers.classifyFile(file)
            if (kind === 'pptx' || kind === 'pdf' || kind === 'docx') {
              const ext = await parsers.extractText(file)
              combinedText += `--- File: ${f.name} ---\n${ext.text.trim()}\n\n`
              if (!primaryKind) primaryKind = kind
              fileNames.push(f.name)
            }
          } catch (e) {
            console.warn(
              '[MoodleImportPanel] extract failed',
              f.name,
              e,
            )
          }
        }

        const pageText = mc.page_content?.text ?? ''
        if (pageText.trim()) {
          combinedText += `--- Moodle page text ---\n${pageText.trim()}\n\n`
        }

        const images = mc.page_content?.images ?? []
        const hasImage = images.length > 0

        // Derive source + source_file label before the API call so that
        // they're available in the final state regardless of outcome.
        let source: EventSource
        if (hasImage) {
          source = 'photo_import'
        } else if (primaryKind === 'pptx') {
          source = 'ppt_import'
        } else if (primaryKind === 'pdf') {
          source = 'pdf_import'
        } else if (primaryKind === 'docx') {
          source = 'docx_import'
        } else {
          source = 'moodle_scan'
        }
        const sourceFile =
          fileNames.length > 0 ? fileNames.join(' + ') : 'moodle_page'

        const trimmed = combinedText.trim()
        if (!trimmed && !hasImage) {
          // Nothing to send to Claude — refund the pre-deduct and bail.
          await refundBalance(costCny, `${description}（无内容，退款）`)
          reloadBalance()
          setAIState((prev) => ({
            ...prev,
            [ci]: {
              status: 'success',
              newEvents: [],
              source,
              sourceFile,
            },
          }))
          return
        }

        // Single API call per course. Claude-proxy's file_import takes at
        // most one image — if the page has multiple images we pass only
        // the first (rest gets text-only treatment).
        let events
        if (hasImage) {
          events = await parseImage(
            images[0].data,
            images[0].mime,
            trimmed,
            courses,
            calendar,
            semester,
          )
        } else {
          events = await parseFileText(
            trimmed,
            (primaryKind ?? 'pdf') as FileKind,
            courses,
            calendar,
            semester,
          )
        }

        const newEvents: MoodleEvent[] = events.map((e) => ({
          title: e.title,
          type: e.type,
          date: e.date,
          time: e.time,
          notes: e.notes ?? null,
          weight: e.weight ?? null,
          is_group: e.is_group ?? false,
          date_inferred: e.date_inferred === true,
          date_source: e.date_source ?? null,
          is_layer2: true,
        }))

        setAIState((prev) => ({
          ...prev,
          [ci]: {
            status: 'success',
            newEvents,
            source,
            sourceFile,
            deductedCny: costCny,
          },
        }))
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        // AI call failed after we already deducted — refund so the user
        // isn't charged for a call that produced nothing.
        await refundBalance(costCny, `${description}（失败退款）`)
        reloadBalance()
        setAIState((prev) => ({
          ...prev,
          [ci]: {
            status: 'error',
            newEvents: [],
            source: 'moodle_scan',
            sourceFile: 'moodle_scan',
            error: msg,
          },
        }))
      }
    },
    [calendar, courses, parseFileText, parseImage, semester, reloadBalance],
  )

  // Auto-select all events when a new payload arrives; also drop any overrides
  // from a previous scan since course indices may no longer line up.
  useEffect(() => {
    if (!moodleData) return
    const next: Record<string, boolean> = {}
    moodleData.forEach((c, ci) => {
      c.events.forEach((_, ei) => {
        next[`${ci}:${ei}`] = true
      })
    })
    setSelected(next)
    setFilesOpen({})
    setOkMsg(null)
    setErr(null)
    setOverrideCodes({})
    setEditingIdx(null)
    setAIState({})
    aiStartedRef.current = new Set()
  }, [moodleData])

  // Kick off AI parse for courses carrying Layer 2 data. Runs once per course
  // per moodleData arrival — the ref guards against StrictMode double-fire.
  // Skip when there are no registered courses: the component shows a
  // "请先导入课程表" screen and we'd otherwise burn Claude quota on events
  // that all land as course_id=null.
  useEffect(() => {
    if (!moodleData || courses.length === 0) return
    moodleData.forEach((mc, ci) => {
      if (aiStartedRef.current.has(ci)) return
      const hasFiles = (mc.downloaded_files?.length ?? 0) > 0
      const hasPage = (mc.page_content?.text?.trim().length ?? 0) > 0
      const hasImage = (mc.page_content?.images?.length ?? 0) > 0
      if (!hasFiles && !hasPage && !hasImage) return
      aiStartedRef.current.add(ci)
      void runAIParse(ci, mc)
    })
  }, [moodleData, runAIParse, courses.length])

  const coursesByCode = useMemo(() => {
    const map = new Map<string, Course>()
    for (const c of courses) {
      if (c.code) map.set(c.code.toUpperCase(), c)
    }
    return map
  }, [courses])

  const matchCourse = (code: string | null): Course | null => {
    if (!code) return null
    return coursesByCode.get(code.toUpperCase()) ?? null
  }

  const resolveCourse = (
    ci: number,
    originalCode: string | null,
  ): { effectiveCode: string | null; matched: Course | null } => {
    const override = overrideCodes[ci]
    if (override === undefined) {
      return {
        effectiveCode: originalCode,
        matched: matchCourse(originalCode),
      }
    }
    if (override === '') {
      return { effectiveCode: null, matched: null }
    }
    return { effectiveCode: override, matched: matchCourse(override) }
  }

  const commitOverride = (ci: number, value: string) => {
    setOverrideCodes((prev) => ({ ...prev, [ci]: value }))
    setEditingIdx(null)
  }

  // enrichedCourses = original Layer 1 events + Layer 2 events from AI parse.
  // Rendering, selection keys, totals, and doImport all iterate over these.
  const enrichedCourses = useMemo(() => {
    if (!moodleData) return null
    return moodleData.map((mc, ci) => {
      const layer1: MoodleEvent[] = mc.events.map((e) => ({
        ...e,
        is_layer2: false,
      }))
      const s = aiState[ci]
      const layer2 = s?.status === 'success' ? s.newEvents : []
      return { ...mc, events: [...layer1, ...layer2] }
    })
  }, [moodleData, aiState])

  // Auto-select newly arrived Layer 2 events (treat absent key as "wants
  // selecting" the first time it's seen). Existing user deselections are
  // preserved because we only touch keys whose value is undefined.
  useEffect(() => {
    if (!enrichedCourses) return
    setSelected((prev) => {
      let changed = false
      const next = { ...prev }
      enrichedCourses.forEach((mc, ci) => {
        mc.events.forEach((_, ei) => {
          const key = `${ci}:${ei}`
          if (next[key] === undefined) {
            next[key] = true
            changed = true
          }
        })
      })
      return changed ? next : prev
    })
  }, [enrichedCourses])

  const totals = useMemo(() => {
    if (!enrichedCourses) return { total: 0, checked: 0 }
    let total = 0
    let checked = 0
    enrichedCourses.forEach((c, ci) => {
      c.events.forEach((_, ei) => {
        total++
        if (selected[`${ci}:${ei}`]) checked++
      })
    })
    return { total, checked }
  }, [enrichedCourses, selected])

  const toggleOne = (key: string) => {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleCourse = (ci: number) => {
    if (!enrichedCourses) return
    const course = enrichedCourses[ci]
    const allChecked = course.events.every((_, ei) => selected[`${ci}:${ei}`])
    setSelected((prev) => {
      const next = { ...prev }
      course.events.forEach((_, ei) => {
        next[`${ci}:${ei}`] = !allChecked
      })
      return next
    })
  }

  const toggleAll = () => {
    if (!enrichedCourses) return
    const target = totals.checked < totals.total
    setSelected(() => {
      const next: Record<string, boolean> = {}
      enrichedCourses.forEach((c, ci) => {
        c.events.forEach((_, ei) => {
          next[`${ci}:${ei}`] = target
        })
      })
      return next
    })
  }

  const doImport = async () => {
    if (!user || !enrichedCourses) return
    setErr(null)
    setOkMsg(null)

    const rawRows: EventRow[] = []
    enrichedCourses.forEach((mc, ci) => {
      const { matched } = resolveCourse(ci, mc.course_code)
      const s = aiState[ci]
      mc.events.forEach((me, ei) => {
        if (!selected[`${ci}:${ei}`]) return
        // Layer 1 events → moodle_scan; Layer 2 events → source derived
        // from what got sent to Claude (file kind or moodle_scan for
        // page-content-only).
        const source: EventSource =
          me.is_layer2 && s ? s.source : MOODLE_SOURCE
        const sourceFile =
          me.is_layer2 && s ? s.sourceFile : 'moodle_scan'
        rawRows.push({
          user_id: user.id,
          semester_id: semester.id,
          course_id: matched?.id ?? null,
          title: me.title,
          type: me.type,
          date: me.date,
          time: me.time,
          weight: me.weight ?? null,
          is_group: me.is_group ?? false,
          notes: me.notes || null,
          source,
          source_file: sourceFile,
          status: 'pending',
          date_inferred: me.date_inferred === true,
          date_source: me.date_source ?? null,
        })
      })
    })

    if (rawRows.length === 0) {
      setErr('请至少勾选一条事件')
      return
    }

    // Dedup within this batch on (course_id, title, date) — same key the DB
    // unique index uses. Without this, an unmatched (course_id=null) + same
    // title + same date row triggers a DB-level unique violation.
    const seen = new Set<string>()
    const rows: EventRow[] = []
    for (const r of rawRows) {
      const key = `${r.course_id ?? ''}|${r.title}|${r.date ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push(r)
    }
    const dedupCount = rawRows.length - rows.length

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
        .in('source', MOODLE_IMPORT_SOURCES)
      if (qErr) {
        setErr(`查已有自动导入事件失败：${qErr.message}`)
        return
      }
      const counts = new Map<string, number>()
      for (const e of existing ?? []) {
        const cid = e.course_id as string
        counts.set(cid, (counts.get(cid) ?? 0) + 1)
      }
      conflicts = Array.from(counts.entries()).map(([courseId, n]) => {
        const c = courses.find((x) => x.id === courseId)
        return {
          courseId,
          courseLabel: c ? `${c.code} ${c.name}` : courseId,
          existingCount: n,
        }
      })
    }

    if (conflicts.length === 0) {
      await executeSave(rows, 'append', [], dedupCount)
      return
    }
    setPending({ rows, conflicts, dedupCount })
  }

  const executeSave = async (
    rows: EventRow[],
    strategy: 'append' | 'replace',
    replaceCourseIds: string[],
    dedupCount: number,
  ) => {
    if (!user) return
    setPending(null)
    setSaving(true)
    setErr(null)

    let deleted = 0
    if (strategy === 'replace' && replaceCourseIds.length > 0) {
      const { error: delErr, count } = await supabase
        .from('events')
        .delete({ count: 'exact' })
        .eq('user_id', user.id)
        .eq('semester_id', semester.id)
        .in('course_id', replaceCourseIds)
        .in('source', MOODLE_IMPORT_SOURCES)
      if (delErr) {
        setErr(`清理旧自动导入失败：${delErr.message}`)
        setSaving(false)
        return
      }
      deleted = count ?? 0
    }

    const { error } = await supabase.from('events').upsert(rows, {
      onConflict: 'user_id,course_id,title,date',
      ignoreDuplicates: false,
    })
    if (error) {
      setErr(error.message)
      setSaving(false)
      return
    }

    const dupNote = dedupCount > 0 ? `（批内去重 ${dedupCount} 条）` : ''
    setOkMsg(
      strategy === 'replace'
        ? `已导入 ${rows.length} 条事件${dupNote}，替换掉 ${deleted} 条旧自动导入。`
        : `已导入 ${rows.length} 条事件${dupNote}。`,
    )
    setSaving(false)
    onSaved()
    setSelected({})
  }

  // Empty / waiting states ----------------------------------------------------

  // Hard prerequisite: we match Moodle assignments/quizzes to courses by code.
  // Without any course rows in this semester, every event would land as
  // course_id=null — better to block and point the user at the right import.
  if (courses.length === 0) {
    return (
      <section className="p-4 rounded-xl bg-card border border-amber-500/40 text-sm text-dim space-y-2">
        <div className="font-medium text-text">
          ⚠️ 请先导入课程表，再使用 Moodle 导入
        </div>
        <div>
          Moodle 导入需要按 course code 关联到已有课程。本学期还没有任何课程
          记录，所有 assignment / quiz 都会变成 course_id=null 的孤立事件。
        </div>
        <div>
          请先通过 <strong>AC Online 插件</strong>{' '}
          从 XMUM AC Online 一键导入课程表，或在"<strong>课程表</strong>" tab
          手动粘贴。
        </div>
        {onGoToCoursesTab && (
          <button
            type="button"
            onClick={onGoToCoursesTab}
            className="mt-1 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium"
          >
            前往 课程表 tab
          </button>
        )}
      </section>
    )
  }

  if (moodleData === null) {
    return (
      <section className="p-4 rounded-xl bg-card border border-border text-sm text-dim space-y-2">
        <div className="font-medium text-text">等待 Moodle 插件数据…</div>
        <div>
          请在{' '}
          <code className="px-1 py-0.5 rounded bg-hover text-text">
            l.xmu.edu.my
          </code>{' '}
          的 Dashboard 或课程页面点击右下角绿色"📋 导入 DDL"按钮。
        </div>
        <div className="text-xs">
          若已点击但数据未到，刷新此页面并重新触发插件即可。
        </div>
      </section>
    )
  }

  if (moodleData.length === 0) {
    return (
      <section className="p-4 rounded-xl bg-card border border-border text-sm text-dim">
        Moodle 插件返回 0 条课程。请确认所在页面含已选课程。
      </section>
    )
  }

  const lowBalance = balance !== null && balance < LOW_BALANCE_THRESHOLD_CNY

  return (
    <section className="space-y-3">
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
          lowBalance
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-600'
            : 'bg-card border-border text-dim'
        }`}
      >
        <Wallet size={14} className="shrink-0" />
        <span className="flex-1">
          余额 {balance === null ? '…' : formatCNY(balance)}
          {lowBalance && '（余额不足，AI 解析将跳过）'}
        </span>
        <button
          type="button"
          onClick={() => setTopupOpen(true)}
          className="text-[11px] px-2 py-0.5 rounded bg-accent text-white font-medium"
        >
          充值
        </button>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-dim">
          扫描到 {moodleData.length} 门课程 · 勾选 {totals.checked}/{totals.total} 条事件
        </div>
        <button
          type="button"
          onClick={toggleAll}
          className="text-xs text-dim hover:text-text px-2 py-1 rounded hover:bg-hover"
        >
          {totals.checked < totals.total ? '全选' : '取消全选'}
        </button>
      </div>

      <div className="space-y-3">
        {(enrichedCourses ?? []).map((mc, ci) => {
          const { effectiveCode, matched } = resolveCourse(ci, mc.course_code)
          const filesExpanded = !!filesOpen[ci]
          const courseAllChecked = mc.events.every(
            (_, ei) => selected[`${ci}:${ei}`],
          )
          const isEditing = editingIdx === ci
          const ai = aiState[ci]
          const originalMc = moodleData[ci]
          return (
            <div
              key={`${mc.course_code ?? 'null'}-${ci}`}
              className="rounded-xl bg-card border border-border"
            >
              <header className="p-3 flex items-start gap-2 border-b border-border">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {matched ? (
                      <CheckCircle2
                        size={14}
                        className="text-emerald-500 shrink-0"
                        aria-label="课程已匹配"
                      />
                    ) : (
                      <AlertTriangle
                        size={14}
                        className="text-amber-500 shrink-0"
                        aria-label="课程未匹配"
                      />
                    )}
                    {isEditing ? (
                      <select
                        autoFocus
                        value={effectiveCode ?? ''}
                        onChange={(e) =>
                          commitOverride(ci, e.currentTarget.value)
                        }
                        onBlur={() => setEditingIdx(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setEditingIdx(null)
                        }}
                        className="max-w-[14rem] px-1.5 py-0.5 text-[11px] font-bold rounded bg-main border border-accent text-text focus:outline-none"
                      >
                        <option value="">不匹配任何课程</option>
                        {courses.map((c) => (
                          <option key={c.id} value={c.code}>
                            {c.code} - {c.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingIdx(ci)
                        }}
                        className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-hover text-dim hover:text-text"
                        aria-label="编辑课程代码"
                      >
                        {effectiveCode || '未识别'}
                        <Pencil size={9} />
                      </button>
                    )}
                    <span className="text-sm font-medium text-text truncate min-w-0">
                      {mc.course_name || '未命名课程'}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-dim">
                    {matched
                      ? `→ ${matched.code} ${matched.name}`
                      : effectiveCode
                        ? `未匹配到课程代码 ${effectiveCode}，点击代码重新选择`
                        : '未关联任何课程，点击代码可选择'}
                  </div>
                </div>
                {mc.events.length > 0 && (
                  <button
                    type="button"
                    onClick={() => toggleCourse(ci)}
                    className="text-[11px] text-dim hover:text-text px-2 py-1 rounded hover:bg-hover shrink-0"
                  >
                    {courseAllChecked ? '取消' : '全选'}
                  </button>
                )}
              </header>

              {ai && (
                <div
                  className={`px-3 py-2 flex items-center gap-2 text-xs border-b border-border ${
                    ai.status === 'running'
                      ? 'bg-sky-500/10 text-sky-600'
                      : ai.status === 'success'
                        ? 'bg-emerald-500/10 text-emerald-600'
                        : ai.status === 'insufficient_balance'
                          ? 'bg-amber-500/10 text-amber-600'
                          : 'bg-red-500/10 text-red-600'
                  }`}
                >
                  {ai.status === 'running' && (
                    <>
                      <Loader2 size={12} className="animate-spin shrink-0" />
                      <span>正在 AI 解析课件…</span>
                    </>
                  )}
                  {ai.status === 'success' && (
                    <>
                      <Sparkles size={12} className="shrink-0" />
                      <span>
                        解析完成，发现 {ai.newEvents.length} 个新事件
                      </span>
                    </>
                  )}
                  {ai.status === 'insufficient_balance' && (
                    <>
                      <Wallet size={12} className="shrink-0" />
                      <span className="flex-1 truncate">
                        {ai.error || '余额不足，未解析'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setTopupOpen(true)}
                        className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded hover:bg-amber-500/20 shrink-0"
                      >
                        充值
                      </button>
                      <button
                        type="button"
                        onClick={() => runAIParse(ci, originalMc)}
                        className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded hover:bg-amber-500/20 shrink-0"
                      >
                        <RotateCcw size={10} /> 重试
                      </button>
                    </>
                  )}
                  {ai.status === 'error' && (
                    <>
                      <AlertTriangle size={12} className="shrink-0" />
                      <span className="flex-1 truncate">
                        解析失败：{ai.error || '未知错误'}
                      </span>
                      <button
                        type="button"
                        onClick={() => runAIParse(ci, originalMc)}
                        className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded hover:bg-red-500/20 shrink-0"
                      >
                        <RotateCcw size={10} /> 重试
                      </button>
                    </>
                  )}
                </div>
              )}

              {mc.events.length === 0 ? (
                <div className="p-3 text-xs text-dim">
                  未发现未来的 assignment / quiz deadline
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {mc.events.map((me, ei) => {
                    const key = `${ci}:${ei}`
                    const checked = !!selected[key]
                    return (
                      <li
                        key={key}
                        className={`p-3 flex items-start gap-3 cursor-pointer hover:bg-hover ${
                          me.is_layer2 ? 'bg-sky-500/5' : ''
                        }`}
                        onClick={() => toggleOne(key)}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleOne(key)
                          }}
                          aria-label={checked ? '取消勾选' : '勾选'}
                          className={`mt-0.5 w-5 h-5 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
                            checked
                              ? 'bg-accent border-accent text-white'
                              : 'border-muted'
                          }`}
                        >
                          {checked && <Check size={12} />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${typeBadgeClass(me.type)}`}
                            >
                              {typeBadgeLabel(me.type)}
                            </span>
                            {me.is_layer2 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-sky-500/20 text-sky-600 inline-flex items-center gap-0.5">
                                <Sparkles size={9} /> AI
                              </span>
                            )}
                            {me.date ? (
                              <span
                                className={`text-[11px] ${me.date_inferred ? 'text-amber-600' : 'text-dim'}`}
                              >
                                {me.date}
                                {me.time ? ` ${me.time}` : ''}
                                {me.date_inferred ? ' (推断)' : ''}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 text-[11px] text-emerald-500 font-medium">
                                <Triangle size={10} /> 待定
                              </span>
                            )}
                            {me.weight && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-hover text-dim">
                                {me.weight}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-text break-words">
                            {me.title}
                          </div>
                          {me.notes && (
                            <div className="mt-0.5 text-[11px] text-dim line-clamp-2">
                              {me.notes}
                            </div>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}

              {mc.files.length > 0 && (
                <div className="border-t border-border">
                  <button
                    type="button"
                    onClick={() =>
                      setFilesOpen((prev) => ({
                        ...prev,
                        [ci]: !prev[ci],
                      }))
                    }
                    className="w-full px-3 py-2 flex items-center justify-between text-xs text-dim hover:bg-hover"
                  >
                    <span className="flex items-center gap-1.5">
                      {filesExpanded ? (
                        <ChevronDown size={12} />
                      ) : (
                        <ChevronRight size={12} />
                      )}
                      <Paperclip size={12} />
                      发现 {mc.files.length} 个课件文件
                    </span>
                    <span className="text-[10px] text-muted italic">
                      文件导入将在后续版本支持
                    </span>
                  </button>
                  {filesExpanded && (
                    <ul className="px-3 pb-3 space-y-1">
                      {mc.files.map((f, fi) => (
                        <li
                          key={`${ci}-${fi}`}
                          className="flex items-center gap-1.5 text-[11px]"
                        >
                          <a
                            href={f.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent hover:underline inline-flex items-center gap-1 min-w-0"
                          >
                            <span className="truncate">{f.name}</span>
                            <ExternalLink size={10} className="shrink-0" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {err && <div className="text-xs text-red-500">{err}</div>}
      {okMsg && <div className="text-xs text-emerald-500">{okMsg}</div>}

      <div className="sticky bottom-0 pt-2 bg-main">
        <button
          type="button"
          onClick={doImport}
          disabled={saving || totals.checked === 0}
          className="w-full py-2.5 rounded-lg bg-accent text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {saving ? (
            <>
              <Loader2 size={14} className="animate-spin" /> 保存中…
            </>
          ) : (
            <>
              <Check size={14} /> 导入选中的 {totals.checked} 条事件
            </>
          )}
        </button>
      </div>

      <ConflictModal
        pending={pending}
        onCancel={() => setPending(null)}
        onAppend={() =>
          pending && executeSave(pending.rows, 'append', [], pending.dedupCount)
        }
        onReplace={() =>
          pending &&
          executeSave(
            pending.rows,
            'replace',
            pending.conflicts.map((c) => c.courseId),
            pending.dedupCount,
          )
        }
      />

      {topupOpen && <TopupModal onClose={() => setTopupOpen(false)} />}
    </section>
  )
}

interface ConflictModalProps {
  pending: Pending | null
  onCancel: () => void
  onAppend: () => void
  onReplace: () => void
}

function ConflictModal({
  pending,
  onCancel,
  onAppend,
  onReplace,
}: ConflictModalProps) {
  return (
    <Modal
      open={!!pending}
      title="课程已有 Moodle 导入事件"
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
            检测到以下课程已有自动导入的事件：
          </div>
          <ul className="rounded-lg bg-card border border-border divide-y divide-border">
            {pending.conflicts.map((c) => (
              <li
                key={c.courseId}
                className="p-2.5 flex justify-between gap-2"
              >
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
              ：删掉这些课程下所有{' '}
              <code>moodle_scan / ppt_import / pdf_import / docx_import /
              photo_import</code>{' '}
              来源的旧事件，然后插入本次新事件。手动 / 快速添加的事件不受影响。
            </div>
            <div>
              <span className="text-text font-medium">追加</span>
              ：保留旧事件，按 (课程 + 标题 + 日期) 去重合并；同键会被新值覆盖。
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
