// Pricing constants for AI features, and a USD formatter.
//
// All amounts in this app are USD. The Supabase tables still have the
// original column names (`balance_cny`, `amount_cny`) from when the system
// used RMB — we kept the column names and just changed what the numbers
// MEAN so we didn't have to migrate a live database. Nothing in the code
// should do currency conversion; values from the DB are already USD.
//
// AI 成本倍率：卖价 = 供应商 API 成本 × API_COST_MULTIPLIER。倍率覆盖代理
// 服务器、Supabase 和运营开销。修改时记得在《使用条款》里同步说明。

import { supabase } from './supabase'

export const API_COST_MULTIPLIER = 2

export function formatUSD(amount: number): string {
  return `$${amount.toFixed(2)}`
}

// Balance below this threshold triggers the "余额不足" warning in the UI.
export const LOW_BALANCE_THRESHOLD_USD = 0.1

// Rough cost estimator for a Claude AI parse call, in raw USD (NOT yet
// multiplied by API_COST_MULTIPLIER). Used only as a UI preview / "needed
// amount" in insufficient-balance toasts; the real deduction is computed
// server-side in claude-proxy from the actual request payload. This
// function MUST stay byte-for-byte identical to estimateRawCostUsd() in
// supabase/functions/claude-proxy/index.ts — when you change one, update
// the other AND redeploy the Edge Function (`supabase functions deploy
// claude-proxy`), otherwise the client's preview and the server's actual
// charge will drift apart.
//
// `textBytes` MUST be the UTF-8 size of the extracted text actually sent
// to the API — never raw binary file sizes. A 10MB PPTX extracts to ~50KB
// of text; passing the raw 10MB used to overestimate by 100×+.
//
// Tokens ≈ UTF-8 bytes / 4 for mixed Chinese/English text (Anthropic
// tokenizer). Vision tokens ≈ image bytes / 600 (rough — Anthropic
// actually charges by image dimensions: width×height/750 tokens).
// Pricing: Claude Haiku 4.5 — $1/M input, $5/M output. The model is
// chosen server-side in claude-proxy; keep this in sync if it changes.
export const MIN_COST_USD = 0.01
export function estimateCourseParseCostUsd(
  textBytes: number,
  imageBytes: number = 0,
): number {
  const inputTokens = textBytes / 4 + imageBytes / 600
  const inputCost = (inputTokens / 1_000_000) * 1
  // Tool-use JSON reply rarely exceeds ~4K tokens. Generous flat estimate.
  const outputCost = 0.02
  return Math.max(MIN_COST_USD, inputCost + outputCost)
}

export interface DeductResult {
  ok: boolean
  new_balance?: number
  stage?: string
  message?: string
}

// Kept for compatibility and future use cases where the client legitimately
// needs to deduct (e.g. a fixed-price feature not routed through claude-
// proxy). The edge function caps MAX_DEDUCT_USD to prevent abuse of this
// path. File-import flows no longer call this — the server deducts inside
// claude-proxy now.
export async function deductBalance(
  amountUsd: number,
  description: string,
): Promise<DeductResult> {
  const { data, error } = await supabase.functions.invoke('balance-deduct', {
    // The edge function parameter is still named `amount_cny` (matches the
    // RPC column), but its value is USD.
    body: { amount_cny: amountUsd, description },
  })
  if (error) {
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = (await ctx.json()) as DeductResult
        return { ...body, ok: false }
      } catch {
        /* fall through */
      }
    }
    return { ok: false, message: error.message }
  }
  return { ok: true, ...(data as Record<string, unknown>) }
}

export async function refundBalance(
  amountUsd: number,
  description: string,
): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.rpc('refund_balance', {
    p_amount_cny: amountUsd,
    p_description: description,
  })
  if (error) return { ok: false, message: error.message }
  return { ok: true }
}
