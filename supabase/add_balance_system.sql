-- Balance system: user_balance + invite_codes + balance_transactions.
-- Apply once in the Supabase SQL editor (project wgqgugltmhjjtobgdlcb).

-- ───────────────────────── user_balance ─────────────────────────
CREATE TABLE IF NOT EXISTS user_balance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  balance_cny DECIMAL(10,2) DEFAULT 0.00 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_balance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own balance" ON user_balance;
CREATE POLICY "Users can view own balance" ON user_balance
  FOR SELECT USING (auth.uid() = user_id);

-- New-user trigger: auto-insert a balance row on auth.users insert.
CREATE OR REPLACE FUNCTION create_user_balance()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_balance (user_id, balance_cny) VALUES (NEW.id, 0.00)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_balance ON auth.users;
CREATE TRIGGER on_auth_user_created_balance
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_user_balance();

-- Backfill: existing users get a zero-balance row.
INSERT INTO user_balance (user_id, balance_cny)
SELECT id, 0.00 FROM auth.users
ON CONFLICT (user_id) DO NOTHING;


-- ───────────────────────── invite_codes ─────────────────────────
CREATE TABLE IF NOT EXISTS invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  used_by UUID REFERENCES auth.users(id),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true
);

ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can check codes" ON invite_codes;
CREATE POLICY "Users can check codes" ON invite_codes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can claim codes" ON invite_codes;
CREATE POLICY "Users can claim codes" ON invite_codes
  FOR UPDATE USING (used_by IS NULL AND is_active = true);


-- ─────────────────────── balance_transactions ───────────────────────
CREATE TABLE IF NOT EXISTS balance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount_cny DECIMAL(10,2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('topup', 'deduct', 'refund')),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE balance_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own transactions" ON balance_transactions;
CREATE POLICY "Users can view own transactions" ON balance_transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS balance_transactions_user_created_idx
  ON balance_transactions (user_id, created_at DESC);
