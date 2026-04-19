import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useSemester } from '../../hooks/useSemester'
import { useCourses } from '../../hooks/useCourses'
import { useEvents } from '../../hooks/useEvents'
import AddEventForm from './import/AddEventForm'
import AddCourseForm from './import/AddCourseForm'
import QuickAddPanel from './import/QuickAddPanel'
import FileImportPanel from './import/FileImportPanel'

type Tab = 'event' | 'course'

export default function ImportView() {
  const { semester } = useSemester()
  const { courses, reload: reloadCourses } = useCourses(semester?.id)
  const { reload: reloadEvents } = useEvents(semester?.id)
  const [tab, setTab] = useState<Tab>('event')

  if (!semester) {
    return (
      <div className="p-8 text-center text-dim">
        <p>尚未创建学期。</p>
        <p className="text-sm mt-2">请先到 Supabase 添加一条 semesters 记录。</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <QuickAddPanel
        semester={semester}
        courses={courses}
        onSaved={reloadEvents}
      />

      <FileImportPanel
        semester={semester}
        courses={courses}
        onSaved={reloadEvents}
      />

      <div className="flex gap-2 bg-card rounded-lg p-1 border border-border">
        <button
          onClick={() => setTab('event')}
          className={`flex-1 py-2 rounded-md text-sm font-medium ${
            tab === 'event' ? 'bg-accent text-white' : 'text-dim'
          }`}
        >
          <Plus size={14} className="inline mr-1" /> 事件
        </button>
        <button
          onClick={() => setTab('course')}
          className={`flex-1 py-2 rounded-md text-sm font-medium ${
            tab === 'course' ? 'bg-accent text-white' : 'text-dim'
          }`}
        >
          <Plus size={14} className="inline mr-1" /> 课程
        </button>
      </div>

      {tab === 'event' ? (
        <AddEventForm semesterId={semester.id} courses={courses} />
      ) : (
        <AddCourseForm semesterId={semester.id} onCreated={reloadCourses} />
      )}
    </div>
  )
}
