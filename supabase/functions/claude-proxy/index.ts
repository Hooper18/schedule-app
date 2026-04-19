// Supabase Edge Function: claude-proxy
//
// Accepts natural-language scheduling input from an authenticated user and
// uses Claude to extract structured events. The Anthropic API key lives in
// Supabase Function Secrets and is never exposed to the browser.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import Anthropic from "npm:@anthropic-ai/sdk@^0.90.0"

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")
if (!ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set in Supabase Function Secrets")
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY ?? "" })

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

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
  input: string
  courses: CourseRef[]
  today: string
  semester_week1_start: string | null
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
            course_id: {
              type: ["string", "null"],
              description:
                "UUID of the matched course from the provided list, or null if no course matches.",
            },
            title: { type: "string", description: "Short event title." },
            type: {
              type: "string",
              enum: EVENT_TYPES as unknown as string[],
            },
            date: {
              type: ["string", "null"],
              description:
                "Absolute date in YYYY-MM-DD. Null if not mentioned or unresolvable.",
            },
            time: {
              type: ["string", "null"],
              description: "24-hour HH:MM. Null if not mentioned.",
            },
            weight: {
              type: ["string", "null"],
              description: "Weight as mentioned, e.g. '10%'. Null if absent.",
            },
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

function buildSystemPrompt(
  courses: CourseRef[],
  today: string,
  week1Start: string | null,
): string {
  const courseList = courses.length
    ? courses.map((c) => `- ${c.code} (id: ${c.id}): ${c.name}`).join("\n")
    : "(no courses registered yet)"

  return `You are parsing natural-language scheduling notes for a student's course calendar and extracting structured events.

Today: ${today}${week1Start ? `\nSemester Week 1 starts: ${week1Start}` : ""}

Available courses:
${courseList}

Guidelines:
- Resolve all relative date references ("next friday", "in 2 weeks", "week 5", "tomorrow") to absolute YYYY-MM-DD based on today's date.
- Times use 24-hour HH:MM. Convert "3pm" → "15:00".
- Match courses by code (case-insensitive); if the text only says a subject name and one course matches clearly, use it. Otherwise leave course_id null.
- Choose the most specific event type. "Assignment due" → deadline. "Final" → exam. "Midterm" → midterm. "Lab report" → lab_report. "Video submission" → video_submission.
- If the input mentions multiple events, return one entry per event.
- Set is_group=true only when the input explicitly indicates a group/team assignment.
- Always call the record_events tool exactly once. Return an empty events array if nothing actionable is present.`
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    })
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({
        error: "Server not configured: ANTHROPIC_API_KEY missing",
      }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    )
  }

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    })
  }

  const { input, courses, today, semester_week1_start } = body
  if (typeof input !== "string" || !input.trim()) {
    return new Response(JSON.stringify({ error: "input is required" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    })
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      system: buildSystemPrompt(
        Array.isArray(courses) ? courses : [],
        today ?? new Date().toISOString().slice(0, 10),
        semester_week1_start ?? null,
      ),
      tools: [recordEventsTool],
      tool_choice: { type: "tool", name: "record_events" },
      messages: [{ role: "user", content: input }],
    })

    const toolUse = response.content.find((b) => b.type === "tool_use")
    if (!toolUse || toolUse.type !== "tool_use") {
      return new Response(
        JSON.stringify({
          error: "Claude did not return a tool_use block",
          stop_reason: response.stop_reason,
        }),
        {
          status: 502,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      )
    }

    return new Response(
      JSON.stringify({
        ...(toolUse.input as Record<string, unknown>),
        usage: response.usage,
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    )
  } catch (err) {
    console.error("claude-proxy error:", err)
    if (err instanceof Anthropic.RateLimitError) {
      return new Response(
        JSON.stringify({ error: "rate_limited", message: err.message }),
        {
          status: 429,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      )
    }
    if (err instanceof Anthropic.APIError) {
      return new Response(
        JSON.stringify({ error: "anthropic_api_error", message: err.message }),
        {
          status: err.status ?? 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      )
    }
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: "internal", message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    })
  }
})
