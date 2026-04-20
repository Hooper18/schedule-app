import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarDays, BookOpen, FileUp, Plus } from 'lucide-react'
import { useSemester } from '../../hooks/useSemester'
import { useCourses } from '../../hooks/useCourses'
import { useEvents } from '../../hooks/useEvents'
import type { ParsedCourse } from '../../hooks/useClaude'
import AddEventForm from './import/AddEventForm'
import AddCourseForm from './import/AddCourseForm'
import QuickAddPanel from './import/QuickAddPanel'
import FileImportPanel from './import/FileImportPanel'
import CalendarPanel from './import/CalendarPanel'
import CoursePastePanel from './import/CoursePastePanel'

type ImportTab = 'calendar' | 'schedule' | 'file'
type ManualTab = 'event' | 'course'

const IMPORT_TABS: { value: ImportTab; label: string; Icon: typeof CalendarDays }[] = [
  { value: 'calendar', label: '校历', Icon: CalendarDays },
  { value: 'schedule', label: '课程表', Icon: BookOpen },
  { value: 'file', label: '课件', Icon: FileUp },
]

export default function ImportView() {
  const { semester } = useSemester()
  const { courses, reload: reloadCourses } = useCourses(semester?.id)
  const { reload: reloadEvents } = useEvents(semester?.id)
  const [searchParams, setSearchParams] = useSearchParams()

  // Decode the Chrome-extension payload once on mount. Synchronous so the
  // first render already has candidates ready and can default to the schedule
  // tab.
  const acData = useMemo(
    () => decodeAcData(searchParams.get('ac_data')),
    // deps intentionally empty — we only honour the param present at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const [importTab, setImportTab] = useState<ImportTab>(
    acData ? 'schedule' : 'calendar',
  )
  const [manualTab, setManualTab] = useState<ManualTab>('event')

  // Strip ac_data from the URL so a page reload doesn't re-populate candidates
  // after the user has already saved or dismissed them.
  useEffect(() => {
    if (searchParams.has('ac_data')) {
      const next = new URLSearchParams(searchParams)
      next.delete('ac_data')
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!semester) {
    return (
      <div className="p-8 text-center text-dim">
        <p>尚未创建学期。</p>
        <p className="text-sm mt-2">请先到 Supabase 添加一条 semesters 记录。</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-5">
      {/* Quick add stays on top */}
      <QuickAddPanel
        semester={semester}
        courses={courses}
        onSaved={reloadEvents}
      />

      {/* Import tabs */}
      <section className="space-y-3">
        <div className="flex gap-1 bg-card rounded-lg p-1 border border-border">
          {IMPORT_TABS.map(({ value, label, Icon }) => (
            <button
              key={value}
              onClick={() => setImportTab(value)}
              className={`flex-1 py-2 rounded-md text-sm font-medium flex items-center justify-center gap-1 transition-colors ${
                importTab === value ? 'bg-accent text-white' : 'text-dim'
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {importTab === 'calendar' && <CalendarPanel semester={semester} />}
        {importTab === 'schedule' && (
          <CoursePastePanel
            semester={semester}
            onSaved={() => {
              reloadCourses()
              reloadEvents()
            }}
            initialCandidates={acData?.courses}
          />
        )}
        {importTab === 'file' && (
          <FileImportPanel
            semester={semester}
            courses={courses}
            onSaved={reloadEvents}
          />
        )}
      </section>

      {/* Manual forms */}
      <section className="space-y-3">
        <div className="text-xs font-semibold tracking-wider text-muted uppercase">
          手动添加
        </div>
        <div className="flex gap-2 bg-card rounded-lg p-1 border border-border">
          <button
            onClick={() => setManualTab('event')}
            className={`flex-1 py-2 rounded-md text-sm font-medium ${
              manualTab === 'event' ? 'bg-accent text-white' : 'text-dim'
            }`}
          >
            <Plus size={14} className="inline mr-1" /> 事件
          </button>
          <button
            onClick={() => setManualTab('course')}
            className={`flex-1 py-2 rounded-md text-sm font-medium ${
              manualTab === 'course' ? 'bg-accent text-white' : 'text-dim'
            }`}
          >
            <Plus size={14} className="inline mr-1" /> 课程
          </button>
        </div>

        {manualTab === 'event' ? (
          <AddEventForm semesterId={semester.id} courses={courses} />
        ) : (
          <AddCourseForm semesterId={semester.id} onCreated={reloadCourses} />
        )}
      </section>
    </div>
  )
}

// Payload shape produced by the AC Online Chrome extension. The extension
// base64-encodes JSON.stringify({ courses, ... }) after UTF-8 encoding, so the
// CJK course names survive the round-trip.
interface AcDataPayload {
  courses: ParsedCourse[]
}

function decodeAcData(b64: string | null): AcDataPayload | null {
  if (!b64) return null
  try {
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    const json = new TextDecoder().decode(bytes)
    const parsed = JSON.parse(json) as AcDataPayload
    if (!parsed || !Array.isArray(parsed.courses)) return null
    return parsed
  } catch (err) {
    console.error('Failed to decode ac_data payload', err)
    return null
  }
}
