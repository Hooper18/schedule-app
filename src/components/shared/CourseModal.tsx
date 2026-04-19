import { useEffect, useState } from 'react'
import { Trash2, AlertTriangle } from 'lucide-react'
import Modal from './Modal'
import { supabase } from '../../lib/supabase'
import type { Course } from '../../lib/types'

const PRESET_COLORS = [
  '#3B82F6',
  '#EF4444',
  '#F59E0B',
  '#10B981',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#F97316',
]

interface Props {
  course: Course | null
  eventCount: number
  onClose: () => void
  onSaved: () => void
}

export default function CourseModal({ course, eventCount, onClose, onSaved }: Props) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [nameFull, setNameFull] = useState('')
  const [lecturer, setLecturer] = useState('')
  const [lecturerEmail, setLecturerEmail] = useState('')
  const [lecturerPhone, setLecturerPhone] = useState('')
  const [office, setOffice] = useState('')
  const [credit, setCredit] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)

  useEffect(() => {
    if (!course) return
    setCode(course.code)
    setName(course.name)
    setNameFull(course.name_full ?? '')
    setLecturer(course.lecturer ?? '')
    setLecturerEmail(course.lecturer_email ?? '')
    setLecturerPhone(course.lecturer_phone ?? '')
    setOffice(course.office ?? '')
    setCredit(course.credit?.toString() ?? '')
    setColor(course.color)
    setNotes(course.notes ?? '')
    setErr(null)
    setConfirmDel(false)
  }, [course])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!course) return
    setSaving(true)
    setErr(null)
    const { error } = await supabase
      .from('courses')
      .update({
        code,
        name,
        name_full: nameFull || name,
        lecturer: lecturer || null,
        lecturer_email: lecturerEmail || null,
        lecturer_phone: lecturerPhone || null,
        office: office || null,
        credit: credit ? Number(credit) : null,
        color,
        notes: notes || null,
      })
      .eq('id', course.id)
    setSaving(false)
    if (error) {
      setErr(error.message)
      return
    }
    onSaved()
    onClose()
  }

  const del = async () => {
    if (!course) return
    setSaving(true)
    setErr(null)
    const { error } = await supabase.from('courses').delete().eq('id', course.id)
    setSaving(false)
    if (error) {
      setErr(error.message)
      return
    }
    onSaved()
    onClose()
  }

  return (
    <Modal
      open={!!course}
      title="编辑课程"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {!confirmDel ? (
            <button
              type="button"
              onClick={() => setConfirmDel(true)}
              className="px-3 py-2.5 rounded-lg border border-red-500/40 text-red-500 hover:bg-red-500/10 text-sm font-medium flex items-center gap-1"
            >
              <Trash2 size={14} /> 删除
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setConfirmDel(false)}
                className="px-3 py-2.5 rounded-lg bg-card border border-border text-dim text-sm"
              >
                取消
              </button>
              <button
                type="button"
                onClick={del}
                disabled={saving}
                className="px-3 py-2.5 rounded-lg bg-red-500 text-white text-sm font-medium disabled:opacity-60"
              >
                确认删除
              </button>
            </>
          )}
          <button
            form="course-modal-form"
            type="submit"
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg bg-accent text-white text-sm font-medium disabled:opacity-60"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      }
    >
      {confirmDel && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-500 flex items-start gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div>
            删除 <strong>{code} {name}</strong> 将同时删除该课程下的{' '}
            <strong>{eventCount}</strong> 条事件与相关时间表，此操作不可恢复。
          </div>
        </div>
      )}

      <form id="course-modal-form" onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="代码 *">
            <input
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="学分">
            <input
              type="number"
              value={credit}
              onChange={(e) => setCredit(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="名称 *">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
          />
        </Field>

        <Field label="完整名称">
          <input
            value={nameFull}
            onChange={(e) => setNameFull(e.target.value)}
            className={inputCls}
          />
        </Field>

        <Field label="讲师">
          <input
            value={lecturer}
            onChange={(e) => setLecturer(e.target.value)}
            className={inputCls}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="邮箱">
            <input
              type="email"
              value={lecturerEmail}
              onChange={(e) => setLecturerEmail(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="电话">
            <input
              value={lecturerPhone}
              onChange={(e) => setLecturerPhone(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="办公室">
          <input
            value={office}
            onChange={(e) => setOffice(e.target.value)}
            className={inputCls}
          />
        </Field>

        <Field label="颜色">
          <div className="flex gap-2 flex-wrap">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-lg border-2 transition ${
                  color === c ? 'border-text scale-110' : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
                aria-label={`选择颜色 ${c}`}
              />
            ))}
          </div>
        </Field>

        <Field label="备注">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className={inputCls}
          />
        </Field>

        {err && <div className="text-sm text-red-500">{err}</div>}
      </form>
    </Modal>
  )
}

const inputCls =
  'w-full px-3 py-2.5 rounded-lg bg-card border border-border text-text placeholder:text-muted focus:outline-none focus:border-accent text-sm'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-dim mb-1">{label}</div>
      {children}
    </label>
  )
}
