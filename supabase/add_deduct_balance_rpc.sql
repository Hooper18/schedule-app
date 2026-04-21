-- Balance deduct / refund RPCs. Both SECURITY DEFINER so authenticated users
-- can mutate user_balance indirectly (there is no direct UPDATE policy on the
-- table — callers have to go through these functions, which enforce the
-- amount/type invariants).

CREATE OR REPLACE FUNCTION deduct_balance(
  p_amount_cny DECIMAL,
  p_description TEXT
)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_current DECIMAL;
  v_new DECIMAL;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_amount_cny <= 0 THEN
    RAISE EXCEPTION 'invalid amount';
  END IF;

  SELECT balance_cny INTO v_current
  FROM user_balance WHERE user_id = v_user_id FOR UPDATE;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'no balance row';
  END IF;

  IF v_current < p_amount_cny THEN
    RAISE EXCEPTION 'insufficient balance';
  END IF;

  UPDATE user_balance
  SET balance_cny = balance_cny - p_amount_cny, updated_at = now()
  WHERE user_id = v_user_id
  RETURNING balance_cny INTO v_new;

  INSERT INTO balance_transactions (user_id, amount_cny, type, description)
  VALUES (v_user_id, -p_amount_cny, 'deduct', p_description);

  RETURN json_build_object('new_balance', v_new);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION deduct_balance(DECIMAL, TEXT) TO authenticated;


CREATE OR REPLACE FUNCTION refund_balance(
  p_amount_cny DECIMAL,
  p_description TEXT
)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_new DECIMAL;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_amount_cny <= 0 THEN
    RAISE EXCEPTION 'invalid amount';
  END IF;

  UPDATE user_balance
  SET balance_cny = balance_cny + p_amount_cny, updated_at = now()
  WHERE user_id = v_user_id
  RETURNING balance_cny INTO v_new;

  IF v_new IS NULL THEN
    RAISE EXCEPTION 'no balance row';
  END IF;

  INSERT INTO balance_transactions (user_id, amount_cny, type, description)
  VALUES (v_user_id, p_amount_cny, 'refund', p_description);

  RETURN json_build_object('new_balance', v_new);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION refund_balance(DECIMAL, TEXT) TO authenticated;
