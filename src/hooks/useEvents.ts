import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Event, EventStatus } from '../lib/types'

export function useEvents(semesterId: string | null | undefined) {
  const { user } = useAuth()
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user || !semesterId) {
      setEvents([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('user_id', user.id)
      .eq('semester_id', semesterId)
      .order('date', { ascending: true, nullsFirst: false })
      .order('time', { ascending: true, nullsFirst: false })
      .order('sort_order')
    if (error) setError(error.message)
    setEvents((data ?? []) as Event[])
    setLoading(false)
  }, [user, semesterId])

  useEffect(() => {
    load()
  }, [load])

  const setStatus = useCallback(
    async (id: string, status: EventStatus) => {
      const { error } = await supabase
        .from('events')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) {
        setError(error.message)
        return
      }
      setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)))
    },
    [],
  )

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from('events').delete().eq('id', id)
    if (error) {
      setError(error.message)
      return
    }
    setEvents((prev) => prev.filter((e) => e.id !== id))
  }, [])

  return { events, loading, error, reload: load, setStatus, remove }
}
