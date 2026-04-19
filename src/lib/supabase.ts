import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anon) {
  throw new Error('缺少 Supabase 环境变量：请复制 .env.example 为 .env 并填写。')
}

export const supabase = createClient(url, anon)
