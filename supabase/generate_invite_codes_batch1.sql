-- Invite codes batch 1 (10 codes, generated 2026-04-23).
-- Each code grants $1.00 via the `redeem_invite_code(p_code)` RPC
-- (default p_bonus_cny = 1.00; the column name is still _cny but the
-- value is USD now — see src/lib/balance.ts).
--
-- Apply once in the Supabase SQL Editor for project wgqgugltmhjjtobgdlcb.
-- Re-running is safe: the ON CONFLICT clause skips codes that already
-- exist. After a code is claimed, `used_by` / `used_at` are set and the
-- code drops out of the "unused and active" pool automatically.

INSERT INTO invite_codes (code, is_active) VALUES
  ('SLCE5GR4', true),
  ('4QY4E7J3', true),
  ('8KH9KASW', true),
  ('5L3JJLD5', true),
  ('GVTV5ZMM', true),
  ('67MUMRHA', true),
  ('QJM59MFZ', true),
  ('BRV2UW7H', true),
  ('UQLDBPFQ', true),
  ('S2RPDY94', true)
ON CONFLICT (code) DO NOTHING;

-- Sanity check: list all still-claimable codes after the insert.
SELECT code, created_at, is_active
FROM invite_codes
WHERE used_by IS NULL AND is_active = true
ORDER BY created_at DESC;
