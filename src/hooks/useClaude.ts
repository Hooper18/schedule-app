import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AcademicCalendar, Course, EventType, Semester } from '../lib/types'
import type { FileKind } from '../lib/fileParsers'
import { todayISO } from '../lib/utils'

export interface ParsedEvent {
  course_id: string | null
  title: string
  type: EventType
  date: string | null
  time: string | null
  weight: string | null
  is_group: boolean
  notes: string | null
}

export interface ParsedCourseSession {
  day_of_week: number
  start_time: string
  end_time: string
  type: 'lecture' | 'tutorial' | 'lab' | 'practical' | 'seminar' | 'other'
  location: string | null
  group_number: string | null
  teaching_weeks: string | null
}

export interface ParsedCourse {
  code: string
  name: string
  name_full: string | null
  credit: number | null
  lecturer: string | null
  sessions: ParsedCourseSession[]
}

interface EventsResponse {
  events: ParsedEvent[]
  usage?: unknown
}

interface CoursesResponse {
  courses: ParsedCourse[]
  usage?: unknown
}

function courseRefs(courses: Course[]) {
  return courses.map((c) => ({ id: c.id, code: c.code, name: c.name }))
}

function calendarRefs(cal: AcademicCalendar[]) {
  return cal.map((c) => ({
    title: c.title,
    date: c.date,
    end_date: c.end_date,
    type: c.type,
  }))
}

export function useClaude() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parseEvents = useCallback(
    async (input: string, courses: Course[], semester: Semester | null) => {
      setLoading(true)
      setError(null)
      try {
        const { data, error: fnError } = await supabase.functions.invoke<EventsResponse>(
          'claude-proxy',
          {
            body: {
              input,
              courses: courseRefs(courses),
              today: todayISO(),
              semester_week1_start: semester?.week1_start ?? null,
            },
          },
        )
        if (fnError) throw fnError
        if (!data) throw new Error('空响应')
        return data.events
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg)
        throw e
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const parseFileText = useCallback(
    async (
      input: string,
      fileKind: FileKind,
      courses: Course[],
      academicCalendar: AcademicCalendar[],
      semester: Semester | null,
    ) => {
      setLoading(true)
      setError(null)
      try {
        const { data, error: fnError } = await supabase.functions.invoke<EventsResponse>(
          'claude-proxy',
          {
            body: {
              action: 'file_import',
              file_type: fileKind,
              input,
              courses: courseRefs(courses),
              academic_calendar: calendarRefs(academicCalendar),
              today: todayISO(),
              semester_week1_start: semester?.week1_start ?? null,
            },
          },
        )
        if (fnError) throw fnError
        if (!data) throw new Error('空响应')
        return data.events
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg)
        throw e
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const parseImage = useCallback(
    async (
      imageBase64: string,
      mediaType: string,
      caption: string,
      courses: Course[],
      academicCalendar: AcademicCalendar[],
      semester: Semester | null,
    ) => {
      setLoading(true)
      setError(null)
      try {
        const { data, error: fnError } = await supabase.functions.invoke<EventsResponse>(
          'claude-proxy',
          {
            body: {
              action: 'file_import',
              file_type: 'image',
              image_base64: imageBase64,
              image_media_type: mediaType,
              input: caption,
              courses: courseRefs(courses),
              academic_calendar: calendarRefs(academicCalendar),
              today: todayISO(),
              semester_week1_start: semester?.week1_start ?? null,
            },
          },
        )
        if (fnError) throw fnError
        if (!data) throw new Error('空响应')
        return data.events
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg)
        throw e
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const parseCourseTimetable = useCallback(async (input: string) => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke<CoursesResponse>(
        'claude-proxy',
        {
          body: {
            action: 'course_import',
            input,
            today: todayISO(),
          },
        },
      )
      if (fnError) throw fnError
      if (!data) throw new Error('空响应')
      return data.courses
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      throw e
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    parseEvents,
    parseFileText,
    parseImage,
    parseCourseTimetable,
    loading,
    error,
  }
}
