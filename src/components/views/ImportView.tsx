import { useState } from 'react'
import { CalendarDays, BookOpen, FileUp, Plus } from 'lucide-react'
import { useSemester } from '../../hooks/useSemester'
import { useCourses } from '../../hooks/useCourses'
import { useEvents } from '../../hooks/useEvents'
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
  const [importTab, setImportTab] = useState<ImportTab>('calendar')
  const [manualTab, setManualTab] = useState<ManualTab>('event')

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
