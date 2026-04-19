import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Course, EventType, Semester } from '../lib/types'
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

interface ParseResponse {
  events: ParsedEvent[]
  usage?: unknown
}

export function useClaude() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parseEvents = useCallback(
    async (input: string, courses: Course[], semester: Semester | null) => {
      setLoading(true)
      setError(null)
      try {
        const { data, error: fnError } = await supabase.functions.invoke<ParseResponse>(
          'claude-proxy',
          {
            body: {
              input,
              courses: courses.map((c) => ({
                id: c.id,
                code: c.code,
                name: c.name,
              })),
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

  return { parseEvents, loading, error }
}
