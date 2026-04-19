import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const TEMPLATE_CODE = '2026/04'

// Module-level guard so React StrictMode double-mount doesn't
// double-insert a semester for the same user.
const started = new Set<string>()

/**
 * On first login for a user, copy the shared XMUM semester template
 * (any row with code='2026/04') + its academic_calendar rows into
 * the current user's account so they see a populated calendar out of
 * the box.
 *
 * Runs once per user.id. Idempotent: if the user already has any
 * semester, it bails immediately.
 */
export function useSemesterBootstrap() {
  const { user } = useAuth()
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
    cancelledRef.current = false
    if (!user) {
      setDone(false)
      return
    }
    const uid = user.id
    if (started.has(uid)) {
      setDone(true)
      return
    }
    started.add(uid)

    ;(async () => {
      try {
        // 1. Does the user already have any semester?
        const { data: mine, error: e1 } = await supabase
          .from('semesters')
          .select('id')
          .eq('user_id', uid)
          .limit(1)
        if (e1) throw new Error(`check existing: ${e1.message}`)
        if (mine && mine.length > 0) {
          if (!cancelledRef.current) setDone(true)
          return
        }

        // 2. Locate a template row (any user's 2026/04 — the RLS read
        //    policy opens these up for authenticated users).
        const { data: tpl, error: e2 } = await supabase
          .from('semesters')
          .select(
            'id, code, name, start_date, week1_start, end_date, revision_start, exam_start, exam_end',
          )
          .eq('code', TEMPLATE_CODE)
          .limit(1)
          .maybeSingle()
        if (e2) throw new Error(`fetch template: ${e2.message}`)
        if (!tpl) {
          // No template exists yet — nothing to clone, leave the UI's
          // empty state to guide the user. Not an error.
          if (!cancelledRef.current) setDone(true)
          return
        }

        // 3. Copy semester under the current user.
        const { data: inserted, error: e3 } = await supabase
          .from('semesters')
          .insert({
            user_id: uid,
            code: tpl.code,
            name: tpl.name,
            start_date: tpl.start_date,
            week1_start: tpl.week1_start,
            end_date: tpl.end_date,
            revision_start: tpl.revision_start,
            exam_start: tpl.exam_start,
            exam_end: tpl.exam_end,
            is_active: true,
          })
          .select('id')
          .single()
        if (e3) throw new Error(`insert semester: ${e3.message}`)

        // 4. Copy academic_calendar rows attached to the template.
        const { data: cal, error: e4 } = await supabase
          .from('academic_calendar')
          .select('title, date, end_date, type')
          .eq('semester_id', tpl.id)
        if (e4) throw new Error(`fetch template calendar: ${e4.message}`)

        if (cal && cal.length > 0) {
          const rows = cal.map((r) => ({
            semester_id: inserted.id,
            title: r.title,
            date: r.date,
            end_date: r.end_date,
            type: r.type,
          }))
          const { error: e5 } = await supabase
            .from('academic_calendar')
            .insert(rows)
          if (e5) throw new Error(`insert calendar: ${e5.message}`)
        }

        if (!cancelledRef.current) setDone(true)
      } catch (err) {
        // Failure — unlock so a retry (page refresh) can try again.
        started.delete(uid)
        const msg = err instanceof Error ? err.message : String(err)
        if (!cancelledRef.current) {
          setError(msg)
          setDone(true) // unblock the UI even on failure
        }
      }
    })()

    return () => {
      cancelledRef.current = true
    }
  }, [user])

  return { done, error }
}
