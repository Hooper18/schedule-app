import { useEffect, useState } from 'react'
import { Check, Loader2, CheckCircle2 } from 'lucide-react'
import Modal from './shared/Modal'
import { supabase } from '../lib/supabase'
import type { Course } from '../lib/types'

interface Props {
  open: boolean
  onClose: () => void
  courses: Course[]
  eventIds: string[]
  /** The detected / displayed course code of the events being reassigned. */
  hintCode?: string | null
  onDone: () => void
}

interface Result {
  moved: number
  removed: number
}

export default function ReassignCourseModal({
  open,
  onClose,
  courses,
  eventIds,
  hintCode,
  onDone,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  // Reset transient state each time the modal re-opens so a second invocation
  // doesn't flash the previous result.
  useEffect(() => {
    if (!open) return
    setSelectedId(null)
    setSaving(false)
    setErr(null)
    setResult(null)
  }, [open])

  const submit = async () => {
    if (!selectedId || eventIds.length === 0) return
    setSaving(true)
    setErr(null)

    // 1) Fetch the source events' (title, date) so we can dedupe against the
    //    target course's existing rows before issuing the UPDATE. The DB has
    //    a UNIQUE(user_id, course_id, title, date) — writing a duplicate
    //    would abort the whole batch.
    const { data: candidates, error: candErr } = await supabase
      .from('events')
      .select('id, title, date')
      .in('id', eventIds)
    if (candErr) {
      setErr(candErr.message)
      setSaving(false)
      return
    }

    // 2) Fetch existing events under the target course to build a conflict
    //    set. RLS already scopes to the current user.
    const { data: existing, error: exErr } = await supabase
      .from('events')
      .select('title, date')
      .eq('course_id', selectedId)
    if (exErr) {
      setErr(exErr.message)
      setSaving(false)
      return
    }
    const keyOf = (title: string, date: string | null) => `${title}||${date ?? ''}`
    const conflict = new Set(
      (existing ?? []).map((e) => keyOf(e.title as string, (e.date as string | null) ?? null)),
    )

    // 3) Partition: duplicates get deleted (target already has that row);
    //    the rest get UPDATEd in a single call.
    const duplicateIds: string[] = []
    const moveIds: string[] = []
    for (const c of candidates ?? []) {
      if (conflict.has(keyOf(c.title as string, (c.date as string | null) ?? null))) {
        duplicateIds.push(c.id as string)
      } else {
        moveIds.push(c.id as string)
      }
    }

    if (duplicateIds.length > 0) {
      const { error: delErr } = await supabase
        .from('events')
        .delete()
        .in('id', duplicateIds)
      if (delErr) {
        setErr(delErr.message)
        setSaving(false)
        return
      }
    }

    if (moveIds.length > 0) {
      const { error: upErr } = await supabase
        .from('events')
        .update({ course_id: selectedId })
        .in('id', moveIds)
      if (upErr) {
        setErr(upErr.message)
        setSaving(false)
        return
      }
    }

    setSaving(false)
    setResult({ moved: moveIds.length, removed: duplicateIds.length })
    onDone()
  }

  const finishAndClose = () => {
    onClose()
    setResult(null)
    setSelectedId(null)
  }

  return (
    <Modal
      open={open}
      title={result ? '关联完成' : '关联到课程'}
      onClose={result ? finishAndClose : onClose}
      size="md"
    >
      {result ? (
        <ResultPanel result={result} onClose={finishAndClose} />
      ) : (
        <div className="space-y-3">
          <div className="text-xs text-dim leading-relaxed">
            将选中的 <span className="text-text font-medium">{eventIds.length}</span>{' '}
            条事件批量关联到以下课程
            {hintCode && (
              <>
                。原课程代码识别为{' '}
                <span className="text-text font-mono">{hintCode}</span>
              </>
            )}
          </div>

          {courses.length === 0 ? (
            <div className="py-10 text-center text-sm text-dim">
              当前学期没有可选课程，请先导入课程表。
            </div>
          ) : (
            <ul className="space-y-1.5 max-h-[55vh] overflow-y-auto pr-1">
              {courses.map((c) => {
                const active = c.id === selectedId
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left ${
                        active
                          ? 'border-accent bg-accent/10'
                          : 'border-border bg-card hover:bg-hover'
                      }`}
                    >
                      <span
                        className="w-1 h-6 rounded-full shrink-0"
                        style={{ backgroundColor: c.color }}
                        aria-hidden
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-text font-mono">
                          {c.code}
                        </div>
                        <div className="text-xs text-dim truncate">{c.name}</div>
                      </div>
                      {active && (
                        <Check size={16} className="text-accent shrink-0" />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {err && <div className="text-xs text-red-500 break-words">{err}</div>}

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-border text-sm text-text hover:bg-hover"
            >
              取消
            </button>
            <button
              type="button"
              disabled={!selectedId || saving}
              onClick={submit}
              className="flex-1 py-2 rounded-lg bg-accent text-white text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              确认关联
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function ResultPanel({
  result,
  onClose,
}: {
  result: Result
  onClose: () => void
}) {
  const { moved, removed } = result
  let summary: string
  if (moved === 0 && removed > 0) {
    summary = `所有事件在目标课程下已存在，已清理 ${removed} 条重复项。`
  } else if (removed === 0) {
    summary = `成功关联 ${moved} 条事件。`
  } else {
    summary = `成功关联 ${moved} 条，跳过 ${removed} 条重复事件（已从原位置删除）。`
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center text-center space-y-2 py-4">
        <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
          <CheckCircle2 className="text-emerald-500" size={24} />
        </div>
        <div className="text-sm text-text leading-relaxed px-4 break-words">
          {summary}
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="w-full py-2.5 rounded-lg bg-accent text-white text-sm font-medium"
      >
        完成
      </button>
    </div>
  )
}
