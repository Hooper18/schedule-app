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

  const input = body.input
  if (typeof input !== "string" || !input.trim()) {
    return jsonError(400, "validate_input", "'input' must be a non-empty string", {
      received_type: typeof input,
      received_value: input === undefined ? "undefined" : null,
    })
  }

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

  const today =
    typeof body.today === "string"
      ? body.today
      : new Date().toISOString().slice(0, 10)
  const week1Start =
    typeof body.semester_week1_start === "string"
      ? body.semester_week1_start
      : null

  console.log(
    `[claude-proxy] user=${userId} input_len=${input.length} courses=${courses.length} today=${today}`,
  )

  try {
    // Note: adaptive thinking is incompatible with forced tool_choice on
    // Opus 4.7 ("Thinking may not be enabled when tool_choice forces tool
    // use"). We keep forced tool_choice for guaranteed structured output
    // and drop thinking — the extraction task is simple enough without it.
    const response = await anthropic.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 4096,
      system: buildSystemPrompt(courses, today, week1Start),
      tools: [recordEventsTool],
      tool_choice: { type: "tool", name: "record_events" },
      messages: [{ role: "user", content: input }],
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

    return new Response(
      JSON.stringify({
        ok: true,
        ...(toolUse.input as Record<string, unknown>),
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
