import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AcademicCalendar } from '../lib/types'

export function useCalendar(semesterId: string | null | undefined) {
  const [entries, setEntries] = useState<AcademicCalendar[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!semesterId) {
      setEntries([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('academic_calendar')
      .select('*')
      .eq('semester_id', semesterId)
      .order('date', { ascending: true })
    if (error) setError(error.message)
    setEntries((data ?? []) as AcademicCalendar[])
    setLoading(false)
  }, [semesterId])

  useEffect(() => {
    load()
  }, [load])

  return { entries, loading, error, reload: load }
}
