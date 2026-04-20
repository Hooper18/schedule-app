import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarDays, BookOpen, FileUp, Plus, GraduationCap } from 'lucide-react'
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
import MoodleImportPanel, {
  type MoodleCourse,
} from './import/MoodleImportPanel'

type ImportTab = 'calendar' | 'schedule' | 'file' | 'moodle'
type ManualTab = 'event' | 'course'

const IMPORT_TABS: { value: ImportTab; label: string; Icon: typeof CalendarDays }[] = [
  { value: 'calendar', label: '校历', Icon: CalendarDays },
  { value: 'schedule', label: '课程表', Icon: BookOpen },
  { value: 'file', label: '课件', Icon: FileUp },
  { value: 'moodle', label: 'Moodle', Icon: GraduationCap },
]

export default function ImportView() {
  const { semester } = useSemester()
  const { courses, reload: reloadCourses } = useCourses(semester?.id)
  const { reload: reloadEvents } = useEvents(semester?.id)
  const [searchParams] = useSearchParams()

  // Pure derivation from the URL — safe under StrictMode double-mount. We do
  // NOT strip ac_data from the URL: saveAll is idempotent (existing courses
  // UPSERT on code), and stripping broke the flow when the component remounts
  // before the user interacts.
  const acData = useMemo(
    () => decodeAcData(searchParams.get('ac_data')),
    [searchParams],
  )

  const isMoodleSource = searchParams.get('source') === 'moodle'

  const [importTab, setImportTab] = useState<ImportTab>(
    isMoodleSource ? 'moodle' : acData ? 'schedule' : 'calendar',
  )
  const [manualTab, setManualTab] = useState<ManualTab>('event')
  const [moodleData, setMoodleData] = useState<MoodleCourse[] | null>(null)

  // Listen for the payload posted by the Moodle extension's bridge.js. Bridge
  // double-posts (immediate + 500ms) so registering on mount is enough.
  useEffect(() => {
    if (!isMoodleSource) return
    const handler = (event: MessageEvent) => {
      if (event.source !== window) return
      const data = event.data as { type?: string; payload?: unknown } | null
      if (!data || data.type !== 'MOODLE_IMPORT_DATA') return
      if (!Array.isArray(data.payload)) return
      setMoodleData(data.payload as MoodleCourse[])
      // Clear ?source=moodle so a reload doesn't leave the listener armed
      // with nothing to receive.
      window.history.replaceState({}, '', '/import')
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [isMoodleSource])

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
        {importTab === 'moodle' && (
          <MoodleImportPanel
            semester={semester}
            courses={courses}
            moodleData={moodleData}
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
