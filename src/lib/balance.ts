// Pricing constants for AI features, and a CNY formatter.
//
// AI 成本倍率：卖价 = 供应商 API 成本 × API_COST_MULTIPLIER × USD_TO_CNY。
// 倍率覆盖代理服务器、Supabase 和运营开销。修改时记得在《使用条款》里同步说明。

import { supabase } from './supabase'

export const API_COST_MULTIPLIER = 3
export const USD_TO_CNY = 7.2

export function usdToCny(usd: number): number {
  return usd * API_COST_MULTIPLIER * USD_TO_CNY
}

export function formatCNY(amount: number): string {
  return `¥${amount.toFixed(2)}`
}

// Balance below this threshold triggers the "余额不足" warning in the UI.
export const LOW_BALANCE_THRESHOLD_CNY = 0.5

// Rough upper-bound token-cost estimator for a Moodle course AI parse, in
// USD. Used to pre-deduct before calling Claude. Over-estimating is fine:
// any excess can be refunded via refund_balance once the actual cost is
// known, though the current client path does a flat refund only on error.
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

export async function deductBalance(
  amountCny: number,
  description: string,
): Promise<DeductResult> {
  const { data, error } = await supabase.functions.invoke('balance-deduct', {
    body: { amount_cny: amountCny, description },
  })
  if (error) {
    // supabase-js wraps non-2xx in a FunctionsHttpError whose `context`
    // carries the underlying Response. Read it so the caller gets the real
    // `stage`/`message` (esp. 402 insufficient balance).
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = (await ctx.json()) as DeductResult
        return { ok: false, ...body }
      } catch {
        /* fall through */
      }
    }
    return { ok: false, message: error.message }
  }
  return { ok: true, ...(data as Record<string, unknown>) }
}

export async function refundBalance(
  amountCny: number,
  description: string,
): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.rpc('refund_balance', {
    p_amount_cny: amountCny,
    p_description: description,
  })
  if (error) return { ok: false, message: error.message }
  return { ok: true }
}
