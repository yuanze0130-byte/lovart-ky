-- Add redeem code system for Lovart credits
-- Run this in your Supabase SQL Editor

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS redeem_code_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  credit_amount INTEGER NOT NULL CHECK (credit_amount > 0),
  channel TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS redeem_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID NOT NULL REFERENCES redeem_code_batches(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  code_mask TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unused' CHECK (status IN ('unused', 'redeemed', 'disabled', 'expired')),
  redeemed_by TEXT,
  redeemed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  note TEXT
);

CREATE TABLE IF NOT EXISTS redeem_code_redemptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code_id UUID NOT NULL REFERENCES redeem_codes(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES redeem_code_batches(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  credit_amount INTEGER NOT NULL CHECK (credit_amount > 0),
  transaction_id UUID,
  ip INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE credit_transactions
  ADD COLUMN IF NOT EXISTS reference_type TEXT,
  ADD COLUMN IF NOT EXISTS balance_after INTEGER;

CREATE INDEX IF NOT EXISTS idx_redeem_code_batches_status ON redeem_code_batches(status);
CREATE INDEX IF NOT EXISTS idx_redeem_code_batches_expires_at ON redeem_code_batches(expires_at);
CREATE INDEX IF NOT EXISTS idx_redeem_codes_batch_id ON redeem_codes(batch_id);
CREATE INDEX IF NOT EXISTS idx_redeem_codes_status ON redeem_codes(status);
CREATE INDEX IF NOT EXISTS idx_redeem_codes_redeemed_by ON redeem_codes(redeemed_by);
CREATE INDEX IF NOT EXISTS idx_redeem_code_redemptions_user_id ON redeem_code_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_redeem_code_redemptions_code_id ON redeem_code_redemptions(code_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_reference_type ON credit_transactions(reference_type);

ALTER TABLE redeem_code_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE redeem_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE redeem_code_redemptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'redeem_code_redemptions' AND policyname = 'Users can view their own redeem code redemptions'
  ) THEN
    CREATE POLICY "Users can view their own redeem code redemptions"
      ON redeem_code_redemptions
      FOR SELECT
      USING (auth.jwt()->>'sub' = user_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_redeem_code_batches_updated_at ON redeem_code_batches;
CREATE TRIGGER update_redeem_code_batches_updated_at
  BEFORE UPDATE ON redeem_code_batches
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION redeem_credit_code(
  p_user_id TEXT,
  p_code_hash TEXT,
  p_ip INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  error_code TEXT,
  credits_added INTEGER,
  current_credits INTEGER,
  transaction_id UUID,
  redemption_id UUID,
  batch_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_code redeem_codes%ROWTYPE;
  v_batch redeem_code_batches%ROWTYPE;
  v_current_credits INTEGER;
  v_next_credits INTEGER;
  v_tx_id UUID;
  v_redemption_id UUID;
BEGIN
  SELECT * INTO v_code
  FROM redeem_codes
  WHERE code_hash = p_code_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'INVALID_CODE', 0, 0, NULL::UUID, NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_batch
  FROM redeem_code_batches
  WHERE id = v_code.batch_id
  FOR UPDATE;

  IF NOT FOUND OR v_batch.status <> 'active' THEN
    RETURN QUERY SELECT FALSE, 'BATCH_DISABLED', 0, 0, NULL::UUID, NULL::UUID, COALESCE(v_batch.name, NULL);
    RETURN;
  END IF;

  IF v_batch.expires_at IS NOT NULL AND v_batch.expires_at <= NOW() THEN
    UPDATE redeem_codes SET status = 'expired' WHERE id = v_code.id AND status <> 'redeemed';
    RETURN QUERY SELECT FALSE, 'CODE_EXPIRED', 0, 0, NULL::UUID, NULL::UUID, v_batch.name;
    RETURN;
  END IF;

  IF v_code.status = 'redeemed' THEN
    RETURN QUERY SELECT FALSE, 'CODE_REDEEMED', 0, 0, NULL::UUID, NULL::UUID, v_batch.name;
    RETURN;
  END IF;

  IF v_code.status = 'disabled' THEN
    RETURN QUERY SELECT FALSE, 'CODE_DISABLED', 0, 0, NULL::UUID, NULL::UUID, v_batch.name;
    RETURN;
  END IF;

  IF v_code.status = 'expired' THEN
    RETURN QUERY SELECT FALSE, 'CODE_EXPIRED', 0, 0, NULL::UUID, NULL::UUID, v_batch.name;
    RETURN;
  END IF;

  INSERT INTO user_credits (user_id, credits)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT credits INTO v_current_credits
  FROM user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  v_next_credits := COALESCE(v_current_credits, 0) + v_batch.credit_amount;

  UPDATE user_credits
  SET credits = v_next_credits,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  v_tx_id := uuid_generate_v4();
  INSERT INTO credit_transactions (
    id,
    user_id,
    amount,
    type,
    description,
    reference_id,
    reference_type,
    balance_after,
    created_at
  ) VALUES (
    v_tx_id,
    p_user_id,
    v_batch.credit_amount,
    'redeem_code',
    CONCAT('兑换卡密批次：', v_batch.name),
    v_code.id::TEXT,
    'redeem_code',
    v_next_credits,
    NOW()
  );

  UPDATE redeem_codes
  SET status = 'redeemed',
      redeemed_by = p_user_id,
      redeemed_at = NOW()
  WHERE id = v_code.id;

  v_redemption_id := uuid_generate_v4();
  INSERT INTO redeem_code_redemptions (
    id,
    code_id,
    batch_id,
    user_id,
    credit_amount,
    transaction_id,
    ip,
    user_agent,
    created_at
  ) VALUES (
    v_redemption_id,
    v_code.id,
    v_batch.id,
    p_user_id,
    v_batch.credit_amount,
    v_tx_id,
    p_ip,
    p_user_agent,
    NOW()
  );

  RETURN QUERY SELECT TRUE, NULL::TEXT, v_batch.credit_amount, v_next_credits, v_tx_id, v_redemption_id, v_batch.name;
END;
$$;

REVOKE ALL ON FUNCTION redeem_credit_code(TEXT, TEXT, INET, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION redeem_credit_code(TEXT, TEXT, INET, TEXT) TO service_role;
