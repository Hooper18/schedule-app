// Supabase Edge Function: balance-deduct
//
// Pre-deducts a pending AI-parse charge from the caller's balance. Thin
// wrapper around the `deduct_balance` Postgres RPC — the function exists so
// that:
//   1. The client never touches user_balance directly (RLS has no UPDATE
//      policy on that table).
//   2. We can later extend this path to include server-side cost calculation
//      (e.g., proxying the Claude call and charging actual token usage).
//
// Body: { amount_cny: number, description: string }
// Returns: { ok: true, new_balance } or { ok: false, stage, message }

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? ""

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
  | "rpc_error"
  | "internal"

function jsonError(status: number, stage: Stage, message: string): Response {
  console.error(`[balance-deduct] ${status} stage=${stage}: ${message}`)
  return new Response(JSON.stringify({ ok: false, stage, message }), {
    status,
    headers: JSON_HEADERS,
  })
}

interface RequestBody {
  amount_cny?: unknown
  description?: unknown
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }
  if (req.method !== "POST") {
    return jsonError(405, "method_check", "method not allowed")
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return jsonError(500, "env_check", "supabase env missing")
  }

  const authHeader = req.headers.get("Authorization")
  if (!authHeader) {
    return jsonError(401, "auth_header_missing", "missing authorization header")
  }

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch (_e) {
    return jsonError(400, "parse_body", "invalid json body")
  }

  const amount = Number(body.amount_cny)
  const description = String(body.description ?? "").trim()
  if (!Number.isFinite(amount) || amount <= 0) {
    return jsonError(400, "validate_input", "amount_cny must be a positive number")
  }
  if (!description) {
    return jsonError(400, "validate_input", "description is required")
  }

  // Client with the caller's JWT so auth.uid() resolves inside the RPC.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data, error } = await supabase.rpc("deduct_balance", {
    p_amount_cny: amount,
    p_description: description,
  })

  if (error) {
    const msg = error.message || "deduct failed"
    // Map known failure modes to 4xx so the client can show a targeted
    // message instead of a generic 500.
    if (msg.includes("insufficient balance")) {
      return jsonError(402, "rpc_error", msg)
    }
    if (msg.includes("not authenticated")) {
      return jsonError(401, "auth_verify_failed", msg)
    }
    return jsonError(500, "rpc_error", msg)
  }

  return new Response(
    JSON.stringify({ ok: true, ...(data as Record<string, unknown>) }),
    { status: 200, headers: JSON_HEADERS },
  )
})
