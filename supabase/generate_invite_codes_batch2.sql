-- Invite codes batch 2 (5 codes, generated 2026-04-25).
-- Each code grants $1.00 via the `redeem_invite_code(p_code)` RPC
-- (default p_bonus_cny = 1.00; the column name is still _cny but the
-- value is USD now — see src/lib/balance.ts).
--
-- Apply once in the Supabase SQL Editor for project wgqgugltmhjjtobgdlcb.
-- Re-running is safe: the ON CONFLICT clause skips codes that already
-- exist. After a code is claimed, `used_by` / `used_at` are set and the
-- code drops out of the "unused and active" pool automatically.

INSERT INTO invite_codes (code, is_active) VALUES
  ('7XK3M9PN', true),
  ('HQ4ZTBR8', true),
  ('2VFD6JLA', true),
  ('W5C9KEYU', true),
  ('N3PG8MTH', true)
ON CONFLICT (code) DO NOTHING;

-- Sanity check: list all still-claimable codes after the insert.
SELECT code, created_at, is_active
FROM invite_codes
WHERE used_by IS NULL AND is_active = true
ORDER BY created_at DESC;
