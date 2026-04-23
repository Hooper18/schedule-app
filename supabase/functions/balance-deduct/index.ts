// Supabase Edge Function: balance-deduct
//
// Pre-deducts a pending charge from the caller's balance. Thin wrapper
// around the `deduct_balance` Postgres RPC — the function exists so that
// the client never touches user_balance directly (RLS has no UPDATE
// policy on that table).
//
// NOTE: The main AI flow (claude-proxy) now deducts server-side from the
// actual request payload and no longer goes through here. This function
// is kept for legacy callers and for manually-priced features that may
// arrive later. Because the amount is still client-supplied, a hard cap
// is enforced to limit blast-radius if a malicious client tries to drain
// a user's own balance via this path.
//
// Body: { amount_cny: number, description: string } — value is USD despite
//       the legacy `_cny` name (see src/lib/balance.ts).
// Returns: { ok: true, new_balance } or { ok: false, stage, message }

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? ""

// Defense-in-depth: reject any single deduction above this threshold.
// $2.00 is 2× the per-call cap in claude-proxy so it won't block legit
// usage but does stop an obvious runaway loop.
const MAX_DEDUCT_USD = 2.0

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
  if (amount > MAX_DEDUCT_USD) {
    return jsonError(
      400,
      "validate_input",
      `amount_cny exceeds per-call cap $${MAX_DEDUCT_USD.toFixed(2)}`,
    )
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
