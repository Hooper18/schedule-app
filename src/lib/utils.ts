import type { Semester } from './types'

export function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseDate(iso: string): Date {
  // Parse ISO date as local midnight to avoid timezone drift
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = parseDate(iso)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function formatShortDate(iso: string): string {
  const d = parseDate(iso)
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return `${d.getMonth() + 1}/${d.getDate()} ${days[d.getDay()]}`
}

export function getDaysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null
  const target = parseDate(iso)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const ms = target.getTime() - now.getTime()
  return Math.round(ms / 86400000)
}

export function weekNumber(iso: string, semester: Pick<Semester, 'week1_start'> | null): number | null {
  if (!semester) return null
  const start = parseDate(semester.week1_start)
  const target = parseDate(iso)
  const days = Math.floor((target.getTime() - start.getTime()) / 86400000)
  if (days < 0) return null
  return Math.floor(days / 7) + 1
}

export function isoOf(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function addMonths(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + n, 1)
}

export function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
}

const TYPE_LABELS: Record<string, string> = {
  exam: 'Exam',
  midterm: 'Midterm',
  quiz: 'Quiz',
  deadline: 'DDL',
  lab_report: 'Lab',
  video_submission: 'Video',
  presentation: 'Presentation',
  tutorial: 'Tutorial',
  consultation: 'Consultation',
  holiday: 'Holiday',
  revision: 'Revision',
  milestone: 'Milestone',
}

export function typeLabel(t: string): string {
  return TYPE_LABELS[t] ?? t
}

const TYPE_COLORS: Record<string, string> = {
  exam: 'bg-red-500/15 text-red-500',
  midterm: 'bg-red-500/15 text-red-500',
  quiz: 'bg-orange-500/15 text-orange-500',
  deadline: 'bg-amber-500/15 text-amber-500',
  lab_report: 'bg-sky-500/15 text-sky-500',
  video_submission: 'bg-purple-500/15 text-purple-500',
  presentation: 'bg-pink-500/15 text-pink-500',
  tutorial: 'bg-teal-500/15 text-teal-500',
  consultation: 'bg-teal-500/15 text-teal-500',
  holiday: 'bg-emerald-500/15 text-emerald-500',
  revision: 'bg-yellow-500/15 text-yellow-600',
  milestone: 'bg-indigo-500/15 text-indigo-500',
}

export function typeColor(t: string): string {
  return TYPE_COLORS[t] ?? 'bg-gray-500/15 text-gray-500'
}

export function compareEvents<T extends { date: string | null; time: string | null; sort_order: number }>(
  a: T,
  b: T,
): number {
  if (a.date && b.date) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    if (a.time && b.time) return a.time < b.time ? -1 : a.time > b.time ? 1 : 0
    if (a.time) return -1
    if (b.time) return 1
  }
  return a.sort_order - b.sort_order
}
