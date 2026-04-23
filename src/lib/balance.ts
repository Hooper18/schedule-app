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

// Rough upper-bound token-cost estimator for a file AI parse, in USD
// (raw API cost, not multiplied by API_COST_MULTIPLIER). Kept on the
// client ONLY as a preview for the user; actual deduction is computed
// server-side in the claude-proxy edge function from the real request
// body, so a malicious client can't lowball the amount.
// Rates assume Claude 3.5 Sonnet ($3/M input, $15/M output).
export function estimateCourseParseCostUsd(
  bytes: number,
  chars: number,
): number {
  const inputTokens = bytes / 3 + chars / 2
  const inputCost = (inputTokens / 1_000_000) * 3
  const outputCost = 0.02 // generous flat — real replies are small JSON
  return Math.max(0.01, inputCost + outputCost)
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
