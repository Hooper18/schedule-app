import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Paperclip,
  Triangle,
} from 'lucide-react'
import Modal from '../../shared/Modal'
import type { Course, EventSource, EventType, Semester } from '../../../lib/types'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'

export interface MoodleEvent {
  title: string
  type: 'deadline' | 'quiz'
  date: string | null
  time: string | null
  notes: string
}

export interface MoodleFile {
  name: string
  url: string
}

export interface MoodleCourse {
  course_code: string | null
  course_name: string
  course_url?: string
  events: MoodleEvent[]
  files: MoodleFile[]
}

interface Props {
  semester: Semester
  courses: Course[]
  moodleData: MoodleCourse[] | null
  onSaved: () => void
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

const MOODLE_SOURCE: EventSource = 'moodle_scan'

export default function MoodleImportPanel({
  semester,
  courses,
  moodleData,
  onSaved,
}: Props) {
  const { user } = useAuth()
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [filesOpen, setFilesOpen] = useState<Record<number, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)

  // Auto-select all events when a new payload arrives.
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
  }, [moodleData])

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

  const totals = useMemo(() => {
    if (!moodleData) return { total: 0, checked: 0 }
    let total = 0
    let checked = 0
    moodleData.forEach((c, ci) => {
      c.events.forEach((_, ei) => {
        total++
        if (selected[`${ci}:${ei}`]) checked++
      })
    })
    return { total, checked }
  }, [moodleData, selected])

  const toggleOne = (key: string) => {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleCourse = (ci: number) => {
    if (!moodleData) return
    const course = moodleData[ci]
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
    if (!moodleData) return
    const target = totals.checked < totals.total
    setSelected(() => {
      const next: Record<string, boolean> = {}
      moodleData.forEach((c, ci) => {
        c.events.forEach((_, ei) => {
          next[`${ci}:${ei}`] = target
        })
      })
      return next
    })
  }

  const doImport = async () => {
    if (!user || !moodleData) return
    setErr(null)
    setOkMsg(null)

    const rawRows: EventRow[] = []
    moodleData.forEach((mc, ci) => {
      const matched = matchCourse(mc.course_code)
      mc.events.forEach((me, ei) => {
        if (!selected[`${ci}:${ei}`]) return
        rawRows.push({
          user_id: user.id,
          semester_id: semester.id,
          course_id: matched?.id ?? null,
          title: me.title,
          type: me.type as EventType,
          date: me.date,
          time: me.time,
          weight: null,
          is_group: false,
          notes: me.notes || null,
          source: MOODLE_SOURCE,
          source_file: 'moodle_scan',
          status: 'pending',
          date_inferred: false,
          date_source: null,
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
        .eq('source', MOODLE_SOURCE)
      if (qErr) {
        setErr(`查已有 moodle 导入事件失败：${qErr.message}`)
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
        .eq('source', MOODLE_SOURCE)
      if (delErr) {
        setErr(`清理旧 moodle 导入失败：${delErr.message}`)
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
        ? `已导入 ${rows.length} 条事件${dupNote}，替换掉 ${deleted} 条旧 moodle 导入。`
        : `已导入 ${rows.length} 条事件${dupNote}。`,
    )
    setSaving(false)
    onSaved()
    setSelected({})
  }

  // Empty / waiting states ----------------------------------------------------

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

  return (
    <section className="space-y-3">
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
        {moodleData.map((mc, ci) => {
          const matched = matchCourse(mc.course_code)
          const filesExpanded = !!filesOpen[ci]
          const courseAllChecked = mc.events.every(
            (_, ei) => selected[`${ci}:${ei}`],
          )
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
                    <span className="text-sm font-medium text-text truncate">
                      {mc.course_name || mc.course_code || '未命名课程'}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-dim">
                    {matched
                      ? `→ ${matched.code} ${matched.name}`
                      : mc.course_code
                        ? `未匹配到课程代码 ${mc.course_code}，将以 course_id=null 导入`
                        : '无法识别课程代码，将以 course_id=null 导入'}
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
                        className="p-3 flex items-start gap-3 cursor-pointer hover:bg-hover"
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
                              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                me.type === 'deadline'
                                  ? 'bg-sky-500/15 text-sky-500'
                                  : 'bg-purple-500/15 text-purple-500'
                              }`}
                            >
                              {me.type === 'deadline' ? 'DDL' : 'Quiz'}
                            </span>
                            {me.date ? (
                              <span className="text-[11px] text-dim">
                                {me.date}
                                {me.time ? ` ${me.time}` : ''}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 text-[11px] text-emerald-500 font-medium">
                                <Triangle size={10} /> 待定
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-text break-words">
                            {me.title}
                          </div>
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
            检测到以下课程已有来自 Moodle 插件的事件：
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
              <code>moodle_scan</code> 来源的旧事件，然后插入本次新事件。
              手动 / 快速添加 / 文件导入的事件不受影响。
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
