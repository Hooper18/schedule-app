export type EventType =
  | 'exam'
  | 'midterm'
  | 'quiz'
  | 'deadline'
  | 'lab_report'
  | 'video_submission'
  | 'presentation'
  | 'tutorial'
  | 'consultation'
  | 'holiday'
  | 'revision'
  | 'milestone'

export type EventSource =
  | 'manual'
  | 'ppt_import'
  | 'pdf_import'
  | 'docx_import'
  | 'photo_import'
  | 'moodle_scan'
  | 'calendar_import'
  | 'nlp_input'

export type EventStatus = 'pending' | 'completed' | 'cancelled'

export interface Semester {
  id: string
  user_id: string
  code: string
  name: string
  start_date: string
  week1_start: string
  end_date: string
  revision_start: string | null
  exam_start: string | null
  exam_end: string | null
  is_active: boolean
  created_at: string
}

export interface ConsultationHour {
  day?: string
  start?: string
  end?: string
  location?: string
  note?: string
}

export interface PassingRule {
  label?: string
  threshold?: number
  note?: string
}

export interface Course {
  id: string
  user_id: string
  semester_id: string
  code: string
  name: string
  name_full: string | null
  lecturer: string | null
  lecturer_email: string | null
  lecturer_phone: string | null
  office: string | null
  color: string
  credit: number | null
  location: string | null
  consultation_hours: ConsultationHour[] | null
  notes: string | null
  passing_rules: PassingRule[] | null
  moodle_course_id: string | null
  moodle_enrolment_key: string | null
  sort_order: number
  created_at: string
}

export interface WeeklySchedule {
  id: string
  course_id: string
  day_of_week: number
  start_time: string
  end_time: string
  location: string | null
  type: string
  group_number: string | null
  teaching_weeks: string
}

export interface Event {
  id: string
  user_id: string
  semester_id: string
  course_id: string | null
  title: string
  type: EventType
  date: string | null
  time: string | null
  end_date: string | null
  week_number: number | null
  weight: string | null
  is_group: boolean
  submission_platform: string | null
  status: EventStatus
  source: EventSource
  source_file: string | null
  notes: string | null
  sort_order: number
  created_at: string
  updated_at: string
  date_inferred: boolean
  date_source: string | null
}

export interface AcademicCalendar {
  id: string
  semester_id: string
  title: string
  date: string
  end_date: string | null
  type: string
  created_at: string
}
