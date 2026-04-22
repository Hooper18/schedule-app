import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
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

  const submit = async () => {
    if (!selectedId || eventIds.length === 0) return
    setSaving(true)
    setErr(null)
    const { error } = await supabase
      .from('events')
      .update({ course_id: selectedId })
      .in('id', eventIds)
    setSaving(false)
    if (error) {
      setErr(error.message)
      return
    }
    onDone()
    onClose()
    setSelectedId(null)
  }

  return (
    <Modal open={open} title="关联到课程" onClose={onClose} size="md">
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

        {err && <div className="text-xs text-red-500">{err}</div>}

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
    </Modal>
  )
}
