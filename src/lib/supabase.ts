import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anon) {
  throw new Error('缺少 Supabase 环境变量：请复制 .env.example 为 .env 并填写。')
}

// detectSessionInUrl lets the client consume the #access_token hash that
// Supabase appends when the user returns from an email-confirmation /
// password-recovery link, so they land back already signed in.
export const supabase = createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'implicit',
  },
})
