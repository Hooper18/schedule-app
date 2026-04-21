-- Atomic invite-code redemption: claim the code, credit balance, log a
-- transaction in one call. SECURITY DEFINER so authenticated users can
-- update user_balance without a direct UPDATE policy (they can only change
-- their balance by calling the RPC, which enforces the invite-code gate).

CREATE OR REPLACE FUNCTION redeem_invite_code(
  p_code TEXT,
  p_bonus_cny DECIMAL DEFAULT 1.00
)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_new_balance DECIMAL;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE invite_codes
  SET used_by = v_user_id, used_at = now()
  WHERE code = p_code AND used_by IS NULL AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid or used code';
  END IF;

  UPDATE user_balance
  SET balance_cny = balance_cny + p_bonus_cny, updated_at = now()
  WHERE user_id = v_user_id
  RETURNING balance_cny INTO v_new_balance;

  INSERT INTO balance_transactions (user_id, amount_cny, type, description)
  VALUES (v_user_id, p_bonus_cny, 'topup', '邀请码注册奖励');

  RETURN json_build_object('new_balance', v_new_balance);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION redeem_invite_code(TEXT, DECIMAL) TO authenticated;
