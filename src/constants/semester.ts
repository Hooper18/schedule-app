// Hard-coded semester dates used by the desktop calendar UI (week labels
// on the month grid, etc.). These are static for the current academic
// year; replace once we start reading from the semesters table proper.
// Teaching weeks start on Sunday — matches the layout of the month grid.

export const CURRENT_SEMESTER = {
  name: 'April 2026',
  teachingStart: '2026-04-05', // W1 Sunday
  teachingEnd: '2026-07-04', // W13 ends (Saturday)
  revisionStart: '2026-07-13',
  revisionEnd: '2026-07-19',
  examStart: '2026-07-20',
  examEnd: '2026-07-31',
} as const

// Returns a label for the Sunday of a given ISO date based on where that
// Sunday falls within the current semester: "W1"…"W13" for teaching weeks,
// "R" for revision, "E" for exam, "" otherwise. We only tag the row that
// contains the Sunday so the label lines up with the leftmost cell.
export function weekLabel(sundayIso: string): string {
  if (sundayIso >= CURRENT_SEMESTER.teachingStart && sundayIso <= CURRENT_SEMESTER.teachingEnd) {
    const start = new Date(CURRENT_SEMESTER.teachingStart)
    const d = new Date(sundayIso)
    const weeks = Math.floor((d.getTime() - start.getTime()) / (7 * 86400000)) + 1
    if (weeks >= 1 && weeks <= 13) return `W${weeks}`
  }
  if (
    sundayIso >= CURRENT_SEMESTER.revisionStart &&
    sundayIso <= CURRENT_SEMESTER.revisionEnd
  ) {
    return 'R'
  }
  if (
    sundayIso >= CURRENT_SEMESTER.examStart &&
    sundayIso <= CURRENT_SEMESTER.examEnd
  ) {
    return 'E'
  }
  return ''
}
