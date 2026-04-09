-- Add credit transaction ledger
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  credits INTEGER NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('debit', 'refund', 'grant')),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'refunded')),
  meta JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own credit transactions"
  ON credit_transactions
  FOR SELECT
  USING (auth.jwt()->>'sub' = user_id);

CREATE POLICY "Users can insert their own credit transactions"
  ON credit_transactions
  FOR INSERT
  WITH CHECK (auth.jwt()->>'sub' = user_id);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id_created_at
  ON credit_transactions(user_id, created_at DESC);
