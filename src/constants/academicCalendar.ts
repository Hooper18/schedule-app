// XMUM academic year 2026. Hard-coded for now; the DB-backed
// academic_calendar table handles per-user semesters for the app's core
// calendar logic, but this page shows the official calendar the whole
// school shares so static data is fine (and much simpler to author).

export interface AcademicSemester {
  name: string
  period: string
  startDate: string
  endDate: string
  teachingStart: string
  teachingEnd: string
  revisionStart: string
  revisionEnd: string
  examStart: string
  examEnd: string
}

export interface Holiday {
  date: string
  name: string
}

export interface SemesterBreak {
  start: string
  end: string
  name: string
}

export const ACADEMIC_CALENDAR_2026 = {
  semesters: [
    {
      name: 'April Semester',
      period: '3 Apr – 31 Jul 2026',
      startDate: '2026-04-03',
      endDate: '2026-07-31',
      teachingStart: '2026-04-05',
      teachingEnd: '2026-07-04',
      revisionStart: '2026-07-13',
      revisionEnd: '2026-07-19',
      examStart: '2026-07-20',
      examEnd: '2026-07-31',
    },
    {
      name: 'September Semester',
      period: '25 Sep 2026 – 21 Jan 2027',
      startDate: '2026-09-25',
      endDate: '2027-01-21',
      teachingStart: '2026-09-27',
      teachingEnd: '2026-12-27',
      revisionStart: '2027-01-04',
      revisionEnd: '2027-01-10',
      examStart: '2027-01-11',
      examEnd: '2027-01-21',
    },
  ] satisfies AcademicSemester[],
  holidays: [
    { date: '2026-02-17', name: 'Chinese New Year' },
    { date: '2026-02-18', name: 'Chinese New Year' },
    { date: '2026-03-07', name: 'Nuzul Al-Quran' },
    { date: '2026-03-21', name: 'Hari Raya Aidilfitri' },
    { date: '2026-03-22', name: 'Hari Raya Aidilfitri' },
    { date: '2026-03-23', name: 'Hari Raya Aidilfitri (replacement)' },
    { date: '2026-05-01', name: 'Labour Day' },
    { date: '2026-05-27', name: 'Hari Raya Haji' },
    { date: '2026-05-31', name: 'Wesak Day' },
    { date: '2026-06-01', name: "Agong's Birthday" },
    { date: '2026-06-17', name: 'Awal Muharram' },
    { date: '2026-08-25', name: "Prophet Muhammad's Birthday" },
    { date: '2026-08-31', name: 'Merdeka Day' },
    { date: '2026-09-16', name: 'Malaysia Day' },
    { date: '2026-11-08', name: 'Deepavali' },
    { date: '2026-11-09', name: 'Deepavali (replacement)' },
    { date: '2026-12-11', name: "Sultan of Selangor's Birthday" },
    { date: '2026-12-25', name: 'Christmas Day' },
  ] satisfies Holiday[],
  semesterBreaks: [
    { start: '2026-08-01', end: '2026-09-24', name: 'Semester Break 1' },
    { start: '2027-01-23', end: '2027-02-11', name: 'Semester Break 2' },
  ] satisfies SemesterBreak[],
}
