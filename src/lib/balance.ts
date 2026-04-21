// Pricing constants for AI features, and a CNY formatter.
//
// AI 成本倍率：卖价 = 供应商 API 成本 × API_COST_MULTIPLIER × USD_TO_CNY。
// 倍率覆盖代理服务器、Supabase 和运营开销。修改时记得在《使用条款》里同步说明。

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
