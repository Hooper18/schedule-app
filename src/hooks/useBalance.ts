import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// Note: DB column names are `balance_cny` / `amount_cny` for legacy reasons
// (the system started out priced in RMB). The stored numbers are USD now;
// see src/lib/balance.ts.
export interface BalanceTransaction {
  id: string
  amount_cny: number
  type: 'topup' | 'deduct' | 'refund'
  description: string | null
  created_at: string
}

export function useBalance() {
  const { user } = useAuth()
  const [balance, setBalance] = useState<number | null>(null)
  const [transactions, setTransactions] = useState<BalanceTransaction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!user) {
      setBalance(null)
      setTransactions([])
      return
    }
    setLoading(true)
    setError(null)
    const [bRes, tRes] = await Promise.all([
      supabase
        .from('user_balance')
        .select('balance_cny')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('balance_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50),
    ])
    if (bRes.error) setError(bRes.error.message)
    else setBalance(bRes.data ? Number(bRes.data.balance_cny) : 0)
    if (tRes.error) setError((e) => e ?? tRes.error!.message)
    else setTransactions((tRes.data ?? []) as BalanceTransaction[])
    setLoading(false)
  }, [user])

  useEffect(() => {
    reload()
  }, [reload])

  return { balance, transactions, loading, error, reload }
}
