import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Course, WeeklySchedule } from '../lib/types'

export function useCourses(semesterId: string | null | undefined) {
  const { user } = useAuth()
  const [courses, setCourses] = useState<Course[]>([])
  const [schedule, setSchedule] = useState<WeeklySchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user || !semesterId) {
      setCourses([])
      setSchedule([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data: courseData, error: courseErr } = await supabase
      .from('courses')
      .select('*')
      .eq('user_id', user.id)
      .eq('semester_id', semesterId)
      .order('sort_order')
      .order('code')
    if (courseErr) {
      setError(courseErr.message)
      setLoading(false)
      return
    }
    const list = (courseData ?? []) as Course[]
    setCourses(list)

    if (list.length > 0) {
      const ids = list.map((c) => c.id)
      const { data: sched, error: schedErr } = await supabase
        .from('weekly_schedule')
        .select('*')
        .in('course_id', ids)
      if (schedErr) setError(schedErr.message)
      setSchedule((sched ?? []) as WeeklySchedule[])
    } else {
      setSchedule([])
    }
    setLoading(false)
  }, [user, semesterId])

  useEffect(() => {
    load()
  }, [load])

  return { courses, schedule, loading, error, reload: load }
}
