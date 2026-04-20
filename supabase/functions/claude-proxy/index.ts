// Supabase Edge Function: claude-proxy
//
// Accepts natural-language scheduling input from an authenticated user and
// uses Claude to extract structured events. The Anthropic API key lives in
// Supabase Function Secrets and is never exposed to the browser.
//
// Deployed with verify_jwt=false so CORS preflight (OPTIONS) passes through
// to this handler — we validate the user's JWT manually on POST by calling
// Supabase's /auth/v1/user endpoint.
//
// Every error response includes a `stage` field so the client (and you
// reading Supabase logs) can tell exactly which step failed.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import Anthropic from "npm:@anthropic-ai/sdk@^0.90.0"

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
}
const JSON_HEADERS = { ...CORS_HEADERS, "Content-Type": "application/json" }

type Stage =
  | "cors_preflight"
  | "method_check"
  | "env_check"
  | "auth_header_missing"
  | "auth_verify_failed"
  | "parse_body"
  | "validate_input"
  | "anthropic_call"
  | "no_tool_use"
  | "rate_limited"
  | "anthropic_api_error"
  | "internal"

function jsonError(
  status: number,
  stage: Stage,
  message: string,
  extra: Record<string, unknown> = {},
): Response {
  const body = { ok: false, stage, message, ...extra }
  console.error(`[claude-proxy] ${status} stage=${stage}: ${message}`, extra)
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY ?? "" })

const EVENT_TYPES = [
  "exam",
  "midterm",
  "quiz",
  "deadline",
  "lab_report",
  "video_submission",
  "presentation",
  "tutorial",
  "consultation",
  "holiday",
  "revision",
  "milestone",
] as const

interface CourseRef {
  id: string
  code: string
  name: string
}

interface RequestBody {
  input?: unknown
  courses?: unknown
  today?: unknown
  semester_week1_start?: unknown
  action?: unknown // "quick_add" (default) | "file_import" | "course_import"
  file_type?: unknown // "pptx" | "pdf" | "docx" | "image" — only for file_import
  image_base64?: unknown // required when file_type === "image"
  image_media_type?: unknown // "image/png" | "image/jpeg" — required when file_type === "image"
  academic_calendar?: unknown // array of {title, date, end_date?, type} — optional DB context
}

type Action = "quick_add" | "file_import" | "course_import"

interface AcademicCalendarRef {
  title: string
  date: string
  end_date: string | null
  type: string
}

// ---- record_courses tool for course_import action ----------------------
// Output schema matches the shape we'll insert into public.courses +
// public.weekly_schedule. Sessions are nested per course so the UI can
// render/edit them grouped.
const recordCoursesTool = {
  name: "record_courses",
  description:
    "Record every course parsed from the pasted student timetable. Always call this exactly once — return an empty courses array if nothing parseable was present.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      courses: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            code: { type: "string", description: "Course code, e.g. COM112" },
            name: {
              type: "string",
              description: "Short course name / subject title",
            },
            name_full: {
              type: ["string", "null"],
              description: "Full course name if shown verbatim",
            },
            credit: { type: ["integer", "null"] },
            lecturer: { type: ["string", "null"] },
            sessions: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  day_of_week: {
                    type: "integer",
                    minimum: 0,
                    maximum: 6,
                    description: "0=Sunday … 6=Saturday",
                  },
                  start_time: {
                    type: "string",
                    description: "24h HH:MM",
                  },
                  end_time: {
                    type: "string",
                    description: "24h HH:MM",
                  },
                  type: {
                    type: "string",
                    enum: ["lecture", "tutorial", "lab", "practical", "seminar", "other"],
                  },
                  location: { type: ["string", "null"] },
                  group_number: { type: ["string", "null"] },
                  teaching_weeks: {
                    type: ["string", "null"],
                    description: "e.g. '1-14' or '1-7,9-14'",
                  },
                },
                required: [
                  "day_of_week",
                  "start_time",
                  "end_time",
                  "type",
                  "location",
                  "group_number",
                  "teaching_weeks",
                ],
              },
            },
          },
          required: ["code", "name", "name_full", "credit", "lecturer", "sessions"],
        },
      },
    },
    required: ["courses"],
  },
}

const recordEventsTool = {
  name: "record_events",
  description:
    "Record all scheduling events parsed from the user input. Always call this exactly once per request — return an empty events array if nothing actionable was mentioned.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      events: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            course_id: { type: ["string", "null"] },
            title: { type: "string" },
            type: {
              type: "string",
              enum: EVENT_TYPES as unknown as string[],
            },
            date: { type: ["string", "null"] },
            time: { type: ["string", "null"] },
            weight: { type: ["string", "null"] },
            is_group: { type: "boolean" },
            notes: { type: ["string", "null"] },
            // file_import sets these; quick_add may omit them (optional).
            date_inferred: {
              type: "boolean",
              description:
                "true only when the date was computed from a Week-N reference or an academic-calendar anchor (e.g. 'Final Exam' → exam week start). false when the source contains an explicit calendar date. Omit/false when date is null.",
            },
            date_source: {
              type: ["string", "null"],
              description:
                "Short label of the original reference that produced an inferred date, e.g. 'Week 13', 'Week 5 Friday', 'Examination Week'. Null when date_inferred is false.",
            },
          },
          required: [
            "course_id",
            "title",
            "type",
            "date",
            "time",
            "weight",
            "is_group",
            "notes",
          ],
        },
      },
    },
    required: ["events"],
  },
}

const CN_WEEKDAYS = [
  "星期日",
  "星期一",
  "星期二",
  "星期三",
  "星期四",
  "星期五",
  "星期六",
]
const EN_WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]
const WEEK_SUFFIX_CN = ["一", "二", "三", "四", "五", "六", "日"]

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}

function formatIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

// Build an explicit anchor table for the current and next ISO weeks
// (Monday–Sunday). Injecting these pre-computed dates eliminates weekday
// arithmetic mistakes (e.g. "下周三" being off by a week).
function buildDateAnchors(today: Date): string {
  // Monday-of-this-week offset: Sun→6, Mon→0, Tue→1, ...
  const daysSinceMonday = (today.getDay() + 6) % 7
  const thisMonday = addDays(today, -daysSinceMonday)
  const nextMonday = addDays(thisMonday, 7)
  const rows: string[] = []
  for (let i = 0; i < 7; i++) {
    const thisD = addDays(thisMonday, i)
    const nextD = addDays(nextMonday, i)
    rows.push(
      `  本周${WEEK_SUFFIX_CN[i]} (this ${EN_WEEKDAYS[thisD.getDay()]}) = ${formatIso(thisD)}    下周${WEEK_SUFFIX_CN[i]} (next ${EN_WEEKDAYS[nextD.getDay()]}) = ${formatIso(nextD)}`,
    )
  }
  return rows.join("\n")
}

function buildSystemPrompt(
  courses: CourseRef[],
  today: string,
  week1Start: string | null,
): string {
  const courseList = courses.length
    ? courses.map((c) => `- ${c.code} (id: ${c.id}): ${c.name}`).join("\n")
    : "(no courses registered yet)"

  const todayDate = parseIsoDate(today)
  const wd = todayDate.getDay()
  const humanCn = `${todayDate.getFullYear()}年${todayDate.getMonth() + 1}月${todayDate.getDate()}日`
  const anchors = buildDateAnchors(todayDate)
  const tomorrow = formatIso(addDays(todayDate, 1))
  const dayAfter = formatIso(addDays(todayDate, 2))

  return `You are parsing natural-language scheduling notes for a student's course calendar and extracting structured events.

今天是 ${humanCn}，${CN_WEEKDAYS[wd]}（${EN_WEEKDAYS[wd]}）。
Today: ${today} (${EN_WEEKDAYS[wd]}).${week1Start ? `\nSemester Week 1 starts: ${week1Start}` : ""}

== Date resolution anchors (pre-computed — DO NOT recompute, look these up) ==
Weeks run Monday–Sunday. Today (${CN_WEEKDAYS[wd]}) sits inside 本周.
${anchors}
  明天 / tomorrow = ${tomorrow}
  后天 / day after tomorrow = ${dayAfter}

Date rules:
- "下周X" / "next 星期X" ALWAYS means the weekday X in the 下周 column above — the week that begins on the UPCOMING Monday. NEVER the week after that.
  Example: if today is 星期日 and today's 下周一 = M, then 下周三 = M + 2 days (look it up in the table).
- "本周X" / "this 星期X" = the 本周 column above, even if that date is already in the past.
- "next Wednesday" in English follows the same 下周 semantics above — it is the Wednesday in the week starting the upcoming Monday, not two weeks out.
- Bare "周X" / weekday name with no 本/下 modifier = the nearest future occurrence (today itself if today matches).
- "在 N 周内" / "in N weeks" = today + 7N days. "Week N" (relative to semester) = week1_start + 7(N−1) days.
- Times use 24-hour HH:MM. "3pm" → "15:00". "下午 3 点" → "15:00".

Available courses:
${courseList}

Other guidelines:
- Match courses by code (case-insensitive); if no clear match, leave course_id null.
- Pick the most specific event type. "Final" → exam. "Midterm" → midterm. "Lab report" → lab_report. "Video submission" → video_submission. Generic assignment due → deadline.
- One entry per event when multiple are mentioned.
- is_group=true only when the input explicitly says group/team/小组.
- Always call record_events exactly once — return an empty events array if nothing actionable.`
}

function formatAcademicCalendar(cal: AcademicCalendarRef[]): string {
  if (!cal.length) return "(no academic calendar provided)"
  return cal
    .map((c) => {
      const range = c.end_date && c.end_date !== c.date ? `${c.date} → ${c.end_date}` : c.date
      return `- [${c.type}] ${c.title}: ${range}`
    })
    .join("\n")
}

// Extract the type=teaching rows into a tight lookup table so Claude never
// has to compute Week N dates on its own — it just reads the table.
function formatTeachingWeekTable(cal: AcademicCalendarRef[]): string {
  const rows = cal
    .filter((c) => c.type === "teaching")
    .map((c) => {
      const m = c.title.match(/Week\s+(\d+)/i)
      const n = m ? parseInt(m[1], 10) : null
      return {
        n,
        title: c.title,
        start: c.date,
        end: c.end_date ?? c.date,
      }
    })
    .filter((r): r is { n: number; title: string; start: string; end: string } => r.n !== null)
    .sort((a, b) => a.n - b.n)

  if (rows.length === 0) return "(no teaching-week rows provided)"
  return rows
    .map((r) => `  Week ${r.n}: ${r.start} → ${r.end}`)
    .join("\n")
}

// File-import prompt — input is the full extracted text (or image) of an
// uploaded course document. Reuses the record_events tool and the same
// date anchor logic; adds semester/holiday context from academic_calendar.
function buildFileImportSystemPrompt(
  courses: CourseRef[],
  academicCalendar: AcademicCalendarRef[],
  today: string,
  week1Start: string | null,
  fileType: string | null,
): string {
  const courseList = courses.length
    ? courses.map((c) => `- ${c.code} (id: ${c.id}): ${c.name}`).join("\n")
    : "(no courses registered yet)"

  const todayDate = parseIsoDate(today)
  const wd = todayDate.getDay()
  const humanCn = `${todayDate.getFullYear()}年${todayDate.getMonth() + 1}月${todayDate.getDate()}日`
  const anchors = buildDateAnchors(todayDate)
  const tomorrow = formatIso(addDays(todayDate, 1))
  const dayAfter = formatIso(addDays(todayDate, 2))
  const calendarText = formatAcademicCalendar(academicCalendar)
  const weekTable = formatTeachingWeekTable(academicCalendar)

  const fileHint =
    fileType === "pptx"
      ? "The text was extracted from a PowerPoint deck; slides are separated roughly in order, and event details may be split across adjacent slides (e.g. a title on one slide, dates on the next)."
      : fileType === "pdf"
        ? "The text was extracted from a PDF (likely a course outline or syllabus). Assessment summaries are often in tables — dates and weights may be in adjacent columns."
        : fileType === "docx"
          ? "The text was extracted from a Word document (likely a course outline or assignment brief)."
          : fileType === "image"
            ? "You are viewing a photo / screenshot of a course material (syllabus page, assessment plan slide, timetable). Read every visible piece of scheduling information."
            : "The content is from a course file."

  return `You are analysing a course file and must extract EVERY scheduling event into a structured list. ${fileHint}

今天是 ${humanCn}，${CN_WEEKDAYS[wd]}（${EN_WEEKDAYS[wd]}）。
Today: ${today} (${EN_WEEKDAYS[wd]}).${week1Start ? `\nSemester Week 1 starts: ${week1Start}` : ""}

== Date resolution anchors (pre-computed — DO NOT recompute, look these up) ==
${anchors}
  明天 / tomorrow = ${tomorrow}
  后天 / day after tomorrow = ${dayAfter}

Academic calendar for this semester:
${calendarText}

== Teaching week lookup table (look up, DO NOT compute) ==
${weekTable}

Three event classes (by date precision) — every emitted event belongs to exactly one class, determined SOLELY by what the document says about timing:
- CLASS A (explicit date): the document contains a concrete calendar date (e.g. "22 May 2026"). date=YYYY-MM-DD, date_inferred=false, date_source=null. UI renders normally on the calendar.
- CLASS B (inferred date): the document gives ONLY a Week-N reference (with or without a weekday), OR explicitly ties the event to the examination period / exam week via a TEMPORAL phrase. date=inferred YYYY-MM-DD via the lookup tables below, date_inferred=true, date_source set ("Week 12" / "Week 5 Friday" / "Examination Week"). UI renders on the calendar with a yellow "inferred date" warning.
- CLASS C (no date): the document gives no date, no Week reference, no exam-week temporal reference, OR explicitly says "TBA"/"TBD"/"待定"/"To be announced"/"TBC". date=null, date_inferred=false, date_source=null. UI does NOT render these on the calendar — they stay in the event list only.

Date rules (apply in order):
- Explicit absolute calendar date in the document (e.g. "22 MAY 2026", "3 July 2026") → CLASS A. date=as-is.
- "Week N" with NO specific weekday → CLASS B. Look up the end_date for that row in the Teaching week lookup table (the week's Saturday). NEVER compute this yourself. date_source="Week N".
- "Week N <weekday>" (e.g. "Week 5 Friday") → CLASS B. Use the matching weekday within Week N's date range from the lookup table. date_source="Week N <weekday>".
- Week N NOT in the lookup table (table shows "(no teaching-week rows provided)" or the specific week row is missing) → CLASS C (date=null).
- Event EXPLICITLY tied to the examination period by a TEMPORAL phrase — "during examination period", "held in exam week", "scheduled in final exam week", "during the examination block" — → CLASS B. date=FIRST DAY of the [exam] row in the academic calendar above. date_source="Examination Week". If there is no [exam] row, fall back to CLASS C.
- FINAL EXAM DEFAULT (applies ONLY to type=exam, i.e. Final Exam / Final Examination): when the event is a Final Exam and the document does NOT give a specific date — whether it is silent about timing or explicitly says "TBA" / "TBD" — automatically place it on the FIRST DAY of the [exam] row in the academic calendar → CLASS B, date_inferred=true, date_source="Examination Week". If there is no [exam] row, fall back to CLASS C. This default applies ONLY to type=exam — it does NOT apply to Midterm, quizzes, assignments, or any other event type.
- Midterm (type=midterm) and every OTHER non-exam event type mentioned by name without a specific date → CLASS C (date=null). Do NOT auto-fill Midterm or any non-Final-Exam event to the exam week — those events are held during teaching weeks, not the exam block. Do NOT guess.
- "TBA" / "TBD" / "To be announced" / "待定" / "TBC" for non-exam events → CLASS C (date=null). (For type=exam, the FINAL EXAM DEFAULT above applies instead.)
- No date AND no Week reference AND no exam-week temporal phrase, for non-exam events → CLASS C (date=null). Do NOT invent a date.
- Respect the academic calendar above — do not schedule events inside holiday/exam/revision rows unless the document explicitly places them there.
- Relative phrases ("next Wednesday" / "下周三") use the anchor table above.
- Times use 24-hour HH:MM. "3pm" → "15:00".

Available courses (match course_code ↔ course_id from this list):
${courseList}

Extraction guidelines:
- Extract EVERY exam, midterm, quiz, assignment/deadline, lab report, video submission, presentation, revision session, or milestone mentioned in the text.
- CRITICAL — category vs. sub-item weights (check FIRST, before splitting): distinguish grading CATEGORIES (umbrella headings like "Coursework 20%", "Continuous Assessment 40%", "Examination 80%") from actual ASSESSMENT items (quizzes, assignments, midterm, final, lab reports, presentations). Detection rule: if an item has specific sub-items listed beneath/under it, each with its own name (and usually its own weight), the outer item IS A CATEGORY — SKIP IT and only emit the sub-items. Examples:
    * "Coursework 20% → Quizzes 10%, Assignment 10%" → emit Quizzes 10% and Assignment 10%. DO NOT emit Coursework 20%.
    * "Examination 80% → Midterm 30%, Final 50%" → emit Midterm 30% and Final 50%. DO NOT emit Examination 80%.
    * "Continuous Assessment 60% → Quiz 1 10%, Quiz 2 10%, Assignment 1 20%, Assignment 2 20%" → emit the four sub-items, SKIP Continuous Assessment.
  Judgement standard: if an item has concrete sub-assessments listed under it, it is a category → skip. Only emit leaf-level assessment items.
  If an item has NO sub-items (just a single name + weight, no further breakdown), it IS the leaf assessment — emit it directly.
  Emitting both a category and its sub-items double-counts weight and pushes the course total above 100%.
- Split every distinctly-named leaf assessment into its own event by DEFAULT. "Quiz 1" with Week 3, "Quiz 2" with Week 7 → two separate events. Never merge leaf assessments that have dates into another event's notes field.
- MERGE RULE for CLASS C sub-items (apply ONLY when ALL three conditions hold): inside the SAME grading category, multiple leaf items of the SAME TYPE (e.g. 3 Quizzes, 4 Lab Reports), every single one of which has NO date information at all (all CLASS C) → collapse them into ONE merged event.
    * title: plural form + count, e.g. "Quizzes (×3)", "Lab Reports (×4)".
    * weight: sum of the individual sub-weights if each sub-item has its own weight. If sub-weights are NOT individually given, compute as [category total weight] − [sum of weights of other sub-items from the same category that you are emitting as separate events]. Example: "Coursework 20% { Group Assignment 5% [Week 12], 3 Quizzes [no dates, no individual weights] }" → Group Assignment is a separate event (CLASS B, 5%); the 3 Quizzes merge into one event with weight = 20% − 5% = 15%.
    * date=null, date_inferred=false, date_source=null.
    * notes: short description of what was merged, e.g. "3 quizzes, no dates specified".
  DIFFERENT event types stay SEPARATE even when all CLASS C: Midterm ≠ Final ≠ Assignment ≠ Quiz ≠ Lab Report. Two CLASS C events of different types → TWO separate events; never one merged "exams" or "assessments" event.
  MIXED classes stay SEPARATE: if one Quiz has a Week reference (CLASS B) and the others have no dates (CLASS C), emit the dated Quiz separately; merge the remaining CLASS C Quizzes only if 2 or more still remain.
- CROSS-FILE DEDUPLICATION (when multiple files are provided): different files may describe the SAME assessment under different names. If two candidate events have (a) the same course, (b) similar titles (e.g. "Assignment 1: Web Analysis" vs "Group Assignment 1" vs "Individual Assignment 1 — Web"), AND (c) the same or very similar weight, merge them into ONE event. Keep the version with the most complete information: prefer an explicit date over a missing one, prefer a more descriptive title, prefer a filled-in time/notes/is_group flag over null. Do NOT emit two events for what is clearly one real assessment.
- DO NOT extract consultation hours, office hours, or 答疑时间. Those are recurring course availability metadata, not scheduling events.
- DO NOT extract generic lecture sessions or weekly tutorial slots that lack a specific date — those belong on the course timetable, not the event list.
- For each event:
  - title: short, human-readable. "Quiz 3" / "Final Exam" / "Assignment 2 submission" / "Lab 4 report". Merged CLASS C events use the "<Type>s (×N)" form.
  - type: most specific match from the enum. "Final" → exam, "Midterm" → midterm, "Lab report" → lab_report, "Video submission" → video_submission, generic "assignment due" → deadline.
  - date: absolute YYYY-MM-DD for CLASS A and CLASS B. null for CLASS C.
  - time: 24h HH:MM if given; null otherwise.
  - weight: as shown in the document ("15%", "20 marks") for individual leaf items. For MERGE RULE events, use the computed sum/residual weight (see MERGE RULE). Null only when no weight can be determined.
  - is_group: true ONLY if the text explicitly says group / team / 小组 / pair.
  - course_id: UUID from the course list above. Match the document's course code (e.g. "COM112") to an entry case-insensitively. Leave null if no confident match.
  - notes: short extra context (platform, special instructions, room). Keep under ~120 chars. Null if nothing useful. EXCEPTION: for MERGE RULE events, put the merge description here (e.g. "3 quizzes, no dates specified"). Do NOT use notes to carry other leaf assessments' weights — each leaf has its own event.
  - date_inferred (REQUIRED on every event): boolean.
      * true for CLASS B (Week-N references of any form, explicit exam-week temporal references).
      * false for CLASS A (explicit calendar date) and for CLASS C (no inference was performed).
  - date_source (REQUIRED on every event; null unless date_inferred is true): string or null.
      * When date_inferred=true: a short label of the reference that produced the date — "Week 13", "Week 5 Friday", "Examination Week".
      * Otherwise null.
- Do NOT invent events. If the text is empty or has no scheduling content, return an empty events array.
- WEIGHT SANITY CHECK (run before returning): for each course_id, sum the numeric weights of all events you are about to emit for that course. If the sum EXCEEDS 100%, something is wrong — you have double-counted a category alongside its sub-items, failed to merge cross-file duplicates, or failed to apply the MERGE RULE. Fix by removing category-level entries (per the CATEGORY rule), merging duplicates (per the CROSS-FILE rule), or merging same-type CLASS C sub-items (per the MERGE RULE) until every course's total weight is ≤ 100%.
- WORKED EXAMPLE — input: "Coursework 20% (3 Quizzes + Group Assignment 5%, due Week 12). Examination 80% (Midterm 30% + Final 50%, TBA)." Correct output (all events for the same course_id):
    * Quizzes (×3), type=quiz, weight="15%" (20% − 5%), date=null, date_inferred=false, date_source=null, notes="3 quizzes, no dates specified". → CLASS C merged.
    * Group Assignment, type=deadline, weight="5%", date=Saturday of Week 12 from the lookup table, date_inferred=true, date_source="Week 12", is_group=true. → CLASS B.
    * Midterm, type=midterm, weight="30%", date=null, date_inferred=false, date_source=null. → CLASS C (kept separate from Final — different types).
    * Final Exam, type=exam, weight="50%", date=FIRST DAY of the [exam] row from the academic calendar, date_inferred=true, date_source="Examination Week". → CLASS B (FINAL EXAM DEFAULT: even when the document says TBA, type=exam auto-infers to the exam-week start).
  Per-course total: 15 + 5 + 30 + 50 = 100 ✓. Coursework 20% and Examination 80% are CATEGORIES → NOT emitted.
- Always call record_events exactly once.`
}

// Course-import prompt — input is pasted text from a student timetable
// system (e.g. XMUM AC Online). Output maps to courses + weekly_schedule.
function buildCourseImportSystemPrompt(): string {
  return `You are parsing a pasted student timetable from a university academic system (commonly XMUM AC Online or similar). Produce a structured course list with recurring weekly sessions.

Conventions:
- day_of_week is integer: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday.
- Times are 24-hour HH:MM. "9:00 AM" → "09:00". "2:30 PM" → "14:30".
- "type" is one of: lecture, tutorial, lab, practical, seminar, other. If the timetable says LEC → lecture; TUT → tutorial; LAB → lab; PRAC/PRACTICAL → practical; SEM → seminar; otherwise "other".
- group_number is the tutorial / lab group identifier if shown (e.g. "G1", "TG2", "A"). Null otherwise.
- teaching_weeks is the weeks range string if given ("1-14", "1-7,9-14"). Default to "1-14" if not specified.
- credit: integer credit hours if shown; null otherwise.
- name_full: the unabbreviated course title if shown; null otherwise.
- lecturer: the instructor's name if shown; null otherwise.

Extraction rules:
- ONE entry per course code. Merge all sessions for the same course into its sessions[] array.
- Do NOT skip sessions even if they share a code — a lecture at Mon 09:00 and a tutorial at Wed 14:00 for COM112 → two entries under the same course's sessions[].
- If a course appears with different group numbers for lecture vs tutorial, keep both as separate sessions with their group numbers.
- Normalize course codes (trim whitespace, uppercase). Do NOT invent missing codes.
- If no courses can be parsed, return an empty courses array.
- Always call record_courses exactly once.`
}

// Plural labels for merged same-type undated events. Falls back to `${type}s`.
const TYPE_PLURALS: Record<string, string> = {
  quiz: "Quizzes",
  lab_report: "Lab Reports",
  deadline: "Assignments",
  presentation: "Presentations",
  tutorial: "Tutorials",
  exam: "Final Exams",
  midterm: "Midterms",
  video_submission: "Video Submissions",
  consultation: "Consultations",
  holiday: "Holidays",
  revision: "Revisions",
  milestone: "Milestones",
}

type FileImportEvent = {
  course_id: string | null
  title: string
  type: string
  date: string | null
  time: string | null
  weight: string | null
  is_group: boolean
  notes: string | null
  date_inferred?: boolean
  date_source?: string | null
}

// Post-process file_import events: merge same-course + same-type + date=null
// events (2+) into a single aggregate so the UI stays stable regardless of
// whether Claude emitted them split or merged.
function postProcessEvents(events: FileImportEvent[]): FileImportEvent[] {
  const groups = new Map<string, FileImportEvent[]>()
  const passthrough: FileImportEvent[] = []

  for (const e of events) {
    if (e.date !== null) {
      passthrough.push(e)
      continue
    }
    if (e.course_id == null || !e.type) {
      passthrough.push(e)
      continue
    }
    const key = `${e.course_id}::${e.type}`
    const arr = groups.get(key) ?? []
    arr.push(e)
    groups.set(key, arr)
  }

  const out: FileImportEvent[] = [...passthrough]
  for (const group of groups.values()) {
    if (group.length < 2) {
      out.push(...group)
      continue
    }
    out.push(mergeUndatedGroup(group))
  }
  return out
}

function mergeUndatedGroup(group: FileImportEvent[]): FileImportEvent {
  const first = group[0]
  const count = group.length
  const plural = TYPE_PLURALS[first.type] ?? `${first.type}s`

  let totalPct = 0
  let anyPct = false
  for (const e of group) {
    if (!e.weight) continue
    const m = e.weight.match(/([\d.]+)\s*%/)
    if (!m) continue
    totalPct += parseFloat(m[1])
    anyPct = true
  }
  const weight = anyPct
    ? `${Number.isInteger(totalPct) ? totalPct : totalPct.toFixed(1)}%`
    : null

  const noteSet = new Set<string>()
  for (const e of group) {
    const n = e.notes?.trim()
    if (n) noteSet.add(n)
  }
  const notes = noteSet.size > 0 ? [...noteSet].join("; ") : null

  return {
    course_id: first.course_id,
    title: `${plural} (×${count})`,
    type: first.type,
    date: null,
    time: null,
    weight,
    is_group: group.some((e) => e.is_group),
    notes,
    date_inferred: false,
    date_source: null,
  }
}

async function verifyUser(
  authHeader: string | null,
): Promise<{ userId: string } | { error: string }> {
  if (!authHeader) return { error: "missing Authorization header" }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { error: "SUPABASE_URL or SUPABASE_ANON_KEY env not set" }
  }
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: authHeader,
        apikey: SUPABASE_ANON_KEY,
      },
    })
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "")
      return {
        error: `/auth/v1/user returned ${resp.status}: ${txt.slice(0, 200)}`,
      }
    }
    const user = (await resp.json()) as { id?: string }
    if (!user.id) return { error: "/auth/v1/user returned no user.id" }
    return { userId: user.id }
  } catch (err) {
    return {
      error: `fetch /auth/v1/user threw: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

Deno.serve(async (req) => {
  const method = req.method

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  // Health check — GET returns env status so you can curl the function URL
  // to confirm secrets are wired before debugging POSTs.
  if (method === "GET") {
    return new Response(
      JSON.stringify({
        ok: true,
        function: "claude-proxy",
        env: {
          ANTHROPIC_API_KEY: !!ANTHROPIC_API_KEY,
          SUPABASE_URL: !!SUPABASE_URL,
          SUPABASE_ANON_KEY: !!SUPABASE_ANON_KEY,
        },
        anthropic_sdk_ok: typeof anthropic?.messages?.create === "function",
      }),
      { status: 200, headers: JSON_HEADERS },
    )
  }

  if (method !== "POST") {
    return jsonError(405, "method_check", `method ${method} not allowed`)
  }

  if (!ANTHROPIC_API_KEY) {
    return jsonError(
      500,
      "env_check",
      "ANTHROPIC_API_KEY is not set in Supabase Function Secrets",
    )
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return jsonError(
      500,
      "env_check",
      "SUPABASE_URL or SUPABASE_ANON_KEY env missing (auto-injected by Supabase — should not happen)",
    )
  }

  const authHeader = req.headers.get("Authorization")
  if (!authHeader) {
    return jsonError(
      401,
      "auth_header_missing",
      "No Authorization header. Did the client send supabase session JWT?",
    )
  }
  const authResult = await verifyUser(authHeader)
  if ("error" in authResult) {
    return jsonError(401, "auth_verify_failed", authResult.error)
  }
  const userId = authResult.userId

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch (err) {
    return jsonError(400, "parse_body", `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`)
  }

  // action defaults to quick_add for backwards compat with existing callers.
  const actionRaw = body.action
  let action: Action = "quick_add"
  if (typeof actionRaw === "string") {
    if (
      actionRaw === "quick_add" ||
      actionRaw === "file_import" ||
      actionRaw === "course_import"
    ) {
      action = actionRaw
    } else {
      return jsonError(
        400,
        "validate_input",
        `'action' must be 'quick_add' | 'file_import' | 'course_import', got '${actionRaw}'`,
      )
    }
  }

  const fileType =
    typeof body.file_type === "string" ? body.file_type : null

  // For file_import with an image, input may be empty (caption optional);
  // otherwise input is required.
  const rawInput = typeof body.input === "string" ? body.input : ""
  const isImageImport =
    action === "file_import" && fileType === "image"
  if (!isImageImport && !rawInput.trim()) {
    return jsonError(400, "validate_input", "'input' must be a non-empty string", {
      received_type: typeof body.input,
    })
  }
  const input = rawInput

  const rawCourses = Array.isArray(body.courses) ? body.courses : []
  const courses: CourseRef[] = rawCourses
    .filter(
      (c): c is CourseRef =>
        !!c &&
        typeof (c as CourseRef).id === "string" &&
        typeof (c as CourseRef).code === "string" &&
        typeof (c as CourseRef).name === "string",
    )
    .map((c) => ({ id: c.id, code: c.code, name: c.name }))

  const rawCalendar = Array.isArray(body.academic_calendar)
    ? body.academic_calendar
    : []
  const academicCalendar: AcademicCalendarRef[] = rawCalendar
    .filter(
      (c): c is AcademicCalendarRef =>
        !!c &&
        typeof (c as AcademicCalendarRef).title === "string" &&
        typeof (c as AcademicCalendarRef).date === "string" &&
        typeof (c as AcademicCalendarRef).type === "string",
    )
    .map((c) => ({
      title: c.title,
      date: c.date,
      end_date:
        typeof c.end_date === "string" && c.end_date ? c.end_date : null,
      type: c.type,
    }))

  const today =
    typeof body.today === "string"
      ? body.today
      : new Date().toISOString().slice(0, 10)
  const week1Start =
    typeof body.semester_week1_start === "string"
      ? body.semester_week1_start
      : null

  // Build user message content. For image imports, wrap the base64 payload
  // as an image content block; Claude Haiku 4.5 supports vision.
  let userContent: Anthropic.Messages.MessageParam["content"]
  if (isImageImport) {
    const b64 = body.image_base64
    const mediaType = body.image_media_type
    if (typeof b64 !== "string" || !b64) {
      return jsonError(
        400,
        "validate_input",
        "file_type=image requires 'image_base64' string",
      )
    }
    if (
      typeof mediaType !== "string" ||
      !/^image\/(png|jpeg|jpg|webp|gif)$/i.test(mediaType)
    ) {
      return jsonError(
        400,
        "validate_input",
        "file_type=image requires a valid 'image_media_type' (image/png | image/jpeg | image/webp | image/gif)",
      )
    }
    const normalizedMedia = mediaType.toLowerCase().replace("jpg", "jpeg") as
      | "image/png"
      | "image/jpeg"
      | "image/webp"
      | "image/gif"
    const imageBlock = {
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: normalizedMedia,
        data: b64,
      },
    }
    userContent = input.trim()
      ? [imageBlock, { type: "text" as const, text: input }]
      : [imageBlock]
  } else {
    userContent = input
  }

  let systemPrompt: string
  let tool: typeof recordEventsTool | typeof recordCoursesTool
  let forcedToolName: string
  let maxTokens: number
  let model: string
  if (action === "file_import") {
    systemPrompt = buildFileImportSystemPrompt(
      courses,
      academicCalendar,
      today,
      week1Start,
      fileType,
    )
    tool = recordEventsTool
    forcedToolName = "record_events"
    maxTokens = 8192
    model = "claude-haiku-4-5-20251001"
  } else if (action === "course_import") {
    systemPrompt = buildCourseImportSystemPrompt()
    tool = recordCoursesTool
    forcedToolName = "record_courses"
    maxTokens = 8192
    model = "claude-haiku-4-5-20251001"
  } else {
    // quick_add — unchanged path
    systemPrompt = buildSystemPrompt(courses, today, week1Start)
    tool = recordEventsTool
    forcedToolName = "record_events"
    maxTokens = 4096
    model = "claude-haiku-4-5-20251001"
  }

  console.log(
    `[claude-proxy] user=${userId} action=${action} file_type=${fileType ?? "-"} input_len=${input.length} image=${isImageImport} courses=${courses.length} cal=${academicCalendar.length} today=${today}`,
  )

  try {
    // Note: forced tool_choice is incompatible with adaptive thinking. We
    // keep forced tool_choice (guarantees structured output) and skip
    // thinking — extraction is simple enough without it.
    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      tools: [tool],
      tool_choice: { type: "tool", name: forcedToolName },
      messages: [{ role: "user", content: userContent }],
    })

    const toolUse = response.content.find((b) => b.type === "tool_use")
    if (!toolUse || toolUse.type !== "tool_use") {
      return jsonError(
        502,
        "no_tool_use",
        `Claude did not return a tool_use block (stop_reason=${response.stop_reason})`,
        {
          content_block_types: response.content.map((b) => b.type),
          stop_reason: response.stop_reason,
        },
      )
    }

    const toolInput = toolUse.input as Record<string, unknown>
    if (action === "file_import" && Array.isArray(toolInput.events)) {
      toolInput.events = postProcessEvents(
        toolInput.events as FileImportEvent[],
      )
    }

    return new Response(
      JSON.stringify({
        ok: true,
        ...toolInput,
        usage: response.usage,
      }),
      { status: 200, headers: JSON_HEADERS },
    )
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return jsonError(429, "rate_limited", err.message)
    }
    if (err instanceof Anthropic.APIError) {
      return jsonError(
        err.status && err.status >= 400 && err.status < 600 ? err.status : 502,
        "anthropic_api_error",
        err.message,
        {
          anthropic_status: err.status,
          anthropic_error_type: (err as { error?: { type?: string } }).error
            ?.type,
          anthropic_request_id: (err as { request_id?: string }).request_id,
        },
      )
    }
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    return jsonError(500, "internal", message, { stack: stack?.split("\n").slice(0, 5) })
  }
})
