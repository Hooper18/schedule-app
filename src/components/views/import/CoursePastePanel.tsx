import { useState } from 'react'
import { Sparkles, Check, X, Trash2 } from 'lucide-react'
import { useClaude, type ParsedCourse, type ParsedCourseSession } from '../../../hooks/useClaude'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import type { Semester } from '../../../lib/types'

const DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']
const SESSION_TYPES: ParsedCourseSession['type'][] = [
  'lecture',
  'tutorial',
  'lab',
  'practical',
  'seminar',
  'other',
]

const PALETTE = [
  '#3B82F6',
  '#EF4444',
  '#F59E0B',
  '#10B981',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#F97316',
  '#84CC16',
  '#A855F7',
]

interface Props {
  semester: Semester
  onSaved: () => void
}

export default function CoursePastePanel({ semester, onSaved }: Props) {
  const { user } = useAuth()
  const { parseCourseTimetable, loading, error } = useClaude()
  const [input, setInput] = useState('')
  const [candidates, setCandidates] = useState<ParsedCourse[]>([])
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  const run = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    setSaveErr(null)
    setOkMsg(null)
    try {
      const courses = await parseCourseTimetable(input)
      setCandidates(courses)
      if (courses.length === 0) {
        setSaveErr('没解析到课程，检查粘贴内容是否完整')
      }
    } catch {
      // hook.error shows
    }
  }

  const patchCourse = (i: number, partial: Partial<ParsedCourse>) => {
    setCandidates((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...partial } : c)))
  }
  const removeCourse = (i: number) => {
    setCandidates((prev) => prev.filter((_, idx) => idx !== i))
  }

  const patchSession = (
    ci: number,
    si: number,
    partial: Partial<ParsedCourseSession>,
  ) => {
    setCandidates((prev) =>
      prev.map((c, idx) =>
        idx === ci
          ? {
              ...c,
              sessions: c.sessions.map((s, sidx) =>
                sidx === si ? { ...s, ...partial } : s,
              ),
            }
          : c,
      ),
    )
  }
  const removeSession = (ci: number, si: number) => {
    setCandidates((prev) =>
      prev.map((c, idx) =>
        idx === ci
          ? { ...c, sessions: c.sessions.filter((_, sidx) => sidx !== si) }
          : c,
      ),
    )
  }

  const saveAll = async () => {
    if (!user || candidates.length === 0) return
    setSaving(true)
    setSaveErr(null)

    const courseRows = candidates.map((c, idx) => ({
      user_id: user.id,
      semester_id: semester.id,
      code: c.code,
      name: c.name,
      name_full: c.name_full ?? c.name,
      lecturer: c.lecturer,
      credit: c.credit,
      color: PALETTE[idx % PALETTE.length],
      sort_order: idx,
    }))

    const { data: inserted, error: insErr } = await supabase
      .from('courses')
      .insert(courseRows)
      .select('id, code, name_full')
    if (insErr) {
      setSaving(false)
      setSaveErr(`写入 courses 失败：${insErr.message}`)
      return
    }

    // Map inserted rows back to their sessions via (code, name_full).
    const byKey = new Map<string, string>()
    for (const row of inserted ?? []) {
      byKey.set(`${row.code}|${row.name_full ?? ''}`, row.id as string)
    }

    const scheduleRows: Array<{
      course_id: string
      day_of_week: number
      start_time: string
      end_time: string
      location: string | null
      type: string
      group_number: string | null
      teaching_weeks: string
    }> = []
    for (const c of candidates) {
      const courseId = byKey.get(`${c.code}|${c.name_full ?? c.name}`)
      if (!courseId) continue
      for (const s of c.sessions) {
        scheduleRows.push({
          course_id: courseId,
          day_of_week: s.day_of_week,
          start_time: s.start_time,
          end_time: s.end_time,
          location: s.location,
          type: s.type,
          group_number: s.group_number,
          teaching_weeks: s.teaching_weeks ?? '1-14',
        })
      }
    }

    if (scheduleRows.length > 0) {
      const { error: schedErr } = await supabase
        .from('weekly_schedule')
        .insert(scheduleRows)
      if (schedErr) {
        setSaving(false)
        setSaveErr(
          `courses 写入成功但 weekly_schedule 失败：${schedErr.message}`,
        )
        return
      }
    }

    setSaving(false)
    setOkMsg(`已导入 ${courseRows.length} 门课程 / ${scheduleRows.length} 条课表。`)
    setCandidates([])
    setInput('')
    onSaved()
  }

  return (
    <section className="space-y-3">
      <form onSubmit={run} className="space-y-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={8}
          placeholder="从 XMUM AC Online 课程表页面复制整块文字粘贴在这里（包含课程代码、名称、讲师、上课日/时段/教室/组别）"
          className="w-full px-3 py-2 rounded-lg bg-card border border-border text-text text-sm placeholder:text-muted focus:outline-none focus:border-accent resize-y"
          disabled={loading}
        />
        <div className="flex items-center justify-between">
          <div className="text-xs text-dim">{input.length} 字符</div>
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium disabled:opacity-40 flex items-center gap-1"
          >
            <Sparkles size={12} /> {loading ? '解析中…' : '解析'}
          </button>
        </div>
      </form>

      {error && <div className="text-xs text-red-500">{error}</div>}
      {saveErr && <div className="text-xs text-red-500">{saveErr}</div>}
      {okMsg && <div className="text-xs text-emerald-500">{okMsg}</div>}

      {candidates.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold tracking-wider text-muted uppercase">
              待确认 · {candidates.length} 门课
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

          <div className="space-y-3">
            {candidates.map((c, ci) => (
              <CourseCandidate
                key={ci}
                value={c}
                onChangeCourse={(p) => patchCourse(ci, p)}
                onChangeSession={(si, p) => patchSession(ci, si, p)}
                onRemoveSession={(si) => removeSession(ci, si)}
                onRemove={() => removeCourse(ci)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  )
}

interface CandidateProps {
  value: ParsedCourse
  onChangeCourse: (partial: Partial<ParsedCourse>) => void
  onChangeSession: (si: number, partial: Partial<ParsedCourseSession>) => void
  onRemoveSession: (si: number) => void
  onRemove: () => void
}

function CourseCandidate({
  value,
  onChangeCourse,
  onChangeSession,
  onRemoveSession,
  onRemove,
}: CandidateProps) {
  return (
    <div className="p-3 rounded-xl bg-card border border-border space-y-2">
      <div className="flex items-center gap-2">
        <input
          value={value.code}
          onChange={(e) => onChangeCourse({ code: e.target.value })}
          className="w-20 text-xs font-bold bg-transparent border-b border-transparent focus:border-accent focus:outline-none text-text"
        />
        <input
          value={value.name}
          onChange={(e) => onChangeCourse({ name: e.target.value })}
          className="flex-1 text-sm bg-transparent border-b border-transparent focus:border-accent focus:outline-none text-text"
        />
        <button
          type="button"
          onClick={onRemove}
          className="p-1 rounded hover:bg-hover text-muted hover:text-red-500"
          aria-label="删除课程"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <input
          value={value.lecturer ?? ''}
          onChange={(e) =>
            onChangeCourse({ lecturer: e.target.value || null })
          }
          placeholder="讲师"
          className={inputCls}
        />
        <input
          type="number"
          value={value.credit ?? ''}
          onChange={(e) =>
            onChangeCourse({
              credit: e.target.value ? Number(e.target.value) : null,
            })
          }
          placeholder="学分"
          className={inputCls}
        />
      </div>

      <div className="space-y-1.5">
        <div className="text-[10px] font-medium tracking-wider text-muted uppercase">
          课时 · {value.sessions.length}
        </div>
        {value.sessions.map((s, si) => (
          <div
            key={si}
            className="grid grid-cols-[auto_auto_auto_1fr_auto] gap-1.5 items-center text-xs"
          >
            <select
              value={s.day_of_week}
              onChange={(e) =>
                onChangeSession(si, { day_of_week: Number(e.target.value) })
              }
              className={cellCls}
            >
              {DAY_LABELS.map((l, i) => (
                <option key={i} value={i}>
                  周{l}
                </option>
              ))}
            </select>
            <input
              type="time"
              value={s.start_time}
              onChange={(e) =>
                onChangeSession(si, { start_time: e.target.value })
              }
              className={cellCls}
            />
            <input
              type="time"
              value={s.end_time}
              onChange={(e) =>
                onChangeSession(si, { end_time: e.target.value })
              }
              className={cellCls}
            />
            <select
              value={s.type}
              onChange={(e) =>
                onChangeSession(si, {
                  type: e.target.value as ParsedCourseSession['type'],
                })
              }
              className={cellCls}
            >
              {SESSION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onRemoveSession(si)}
              className="p-1 rounded hover:bg-hover text-muted hover:text-red-500"
              aria-label="删除"
            >
              <Trash2 size={12} />
            </button>
            <input
              value={s.location ?? ''}
              onChange={(e) =>
                onChangeSession(si, { location: e.target.value || null })
              }
              placeholder="教室"
              className={`${cellCls} col-span-3`}
            />
            <input
              value={s.group_number ?? ''}
              onChange={(e) =>
                onChangeSession(si, { group_number: e.target.value || null })
              }
              placeholder="组别"
              className={cellCls}
            />
            <input
              value={s.teaching_weeks ?? ''}
              onChange={(e) =>
                onChangeSession(si, { teaching_weeks: e.target.value || null })
              }
              placeholder="1-14"
              className={cellCls}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

const inputCls =
  'px-2 py-1.5 rounded bg-main border border-border text-text placeholder:text-muted focus:outline-none focus:border-accent text-xs'
const cellCls =
  'px-1.5 py-1 rounded bg-main border border-border text-text placeholder:text-muted focus:outline-none focus:border-accent text-xs'
