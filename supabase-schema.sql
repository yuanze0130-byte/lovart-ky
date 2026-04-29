-- Lovart UI Database Schema for Supabase
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create user_credits table
CREATE TABLE IF NOT EXISTS user_credits (
  user_id TEXT PRIMARY KEY,
  credits INTEGER NOT NULL DEFAULT 30,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL DEFAULT auth.jwt()->>'sub',
  title TEXT NOT NULL,
  thumbnail TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create canvas_elements table
CREATE TABLE IF NOT EXISTS canvas_elements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  element_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create credit_transactions table
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  reference_id TEXT,
  reference_type TEXT,
  balance_after INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create redeem code batch table
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

-- Create redeem codes table
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

-- Create redeem code redemptions table
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

-- Enable Row Level Security (RLS) on projects table
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'projects' AND policyname = 'Users can view their own projects'
  ) THEN
    CREATE POLICY "Users can view their own projects"
      ON projects
      FOR SELECT
      USING (auth.jwt()->>'sub' = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'projects' AND policyname = 'Users can insert their own projects'
  ) THEN
    CREATE POLICY "Users can insert their own projects"
      ON projects
      FOR INSERT
      WITH CHECK (auth.jwt()->>'sub' = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'projects' AND policyname = 'Users can update their own projects'
  ) THEN
    CREATE POLICY "Users can update their own projects"
      ON projects
      FOR UPDATE
      USING (auth.jwt()->>'sub' = user_id)
      WITH CHECK (auth.jwt()->>'sub' = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'projects' AND policyname = 'Users can delete their own projects'
  ) THEN
    CREATE POLICY "Users can delete their own projects"
      ON projects
      FOR DELETE
      USING (auth.jwt()->>'sub' = user_id);
  END IF;
END $$;

-- Enable Row Level Security (RLS) on canvas_elements table
ALTER TABLE canvas_elements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'canvas_elements' AND policyname = 'Users can view their own canvas elements'
  ) THEN
    CREATE POLICY "Users can view their own canvas elements"
      ON canvas_elements
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM projects
          WHERE projects.id = canvas_elements.project_id
          AND projects.user_id = auth.jwt()->>'sub'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'canvas_elements' AND policyname = 'Users can insert canvas elements to their projects'
  ) THEN
    CREATE POLICY "Users can insert canvas elements to their projects"
      ON canvas_elements
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM projects
          WHERE projects.id = canvas_elements.project_id
          AND projects.user_id = auth.jwt()->>'sub'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'canvas_elements' AND policyname = 'Users can update their own canvas elements'
  ) THEN
    CREATE POLICY "Users can update their own canvas elements"
      ON canvas_elements
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM projects
          WHERE projects.id = canvas_elements.project_id
          AND projects.user_id = auth.jwt()->>'sub'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM projects
          WHERE projects.id = canvas_elements.project_id
          AND projects.user_id = auth.jwt()->>'sub'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'canvas_elements' AND policyname = 'Users can delete their own canvas elements'
  ) THEN
    CREATE POLICY "Users can delete their own canvas elements"
      ON canvas_elements
      FOR DELETE
      USING (
        EXISTS (
          SELECT 1 FROM projects
          WHERE projects.id = canvas_elements.project_id
          AND projects.user_id = auth.jwt()->>'sub'
        )
      );
  END IF;
END $$;

ALTER TABLE credit_transactions
  ADD COLUMN IF NOT EXISTS reference_type TEXT,
  ADD COLUMN IF NOT EXISTS balance_after INTEGER;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_canvas_elements_project_id ON canvas_elements(project_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_reference_type ON credit_transactions(reference_type);
CREATE INDEX IF NOT EXISTS idx_redeem_code_batches_status ON redeem_code_batches(status);
CREATE INDEX IF NOT EXISTS idx_redeem_code_batches_expires_at ON redeem_code_batches(expires_at);
CREATE INDEX IF NOT EXISTS idx_redeem_codes_batch_id ON redeem_codes(batch_id);
CREATE INDEX IF NOT EXISTS idx_redeem_codes_status ON redeem_codes(status);
CREATE INDEX IF NOT EXISTS idx_redeem_codes_redeemed_by ON redeem_codes(redeemed_by);
CREATE INDEX IF NOT EXISTS idx_redeem_code_redemptions_user_id ON redeem_code_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_redeem_code_redemptions_code_id ON redeem_code_redemptions(code_id);

-- Create a function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to automatically update updated_at
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_canvas_elements_updated_at ON canvas_elements;
CREATE TRIGGER update_canvas_elements_updated_at
  BEFORE UPDATE ON canvas_elements
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_credits_updated_at ON user_credits;
CREATE TRIGGER update_user_credits_updated_at
  BEFORE UPDATE ON user_credits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_redeem_code_batches_updated_at ON redeem_code_batches;
CREATE TRIGGER update_redeem_code_batches_updated_at
  BEFORE UPDATE ON redeem_code_batches
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS) on credit tables
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE redeem_code_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE redeem_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE redeem_code_redemptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_credits' AND policyname = 'Users can view their own credits'
  ) THEN
    CREATE POLICY "Users can view their own credits"
      ON user_credits
      FOR SELECT
      USING (auth.jwt()->>'sub' = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_credits' AND policyname = 'Users can insert their own credits'
  ) THEN
    CREATE POLICY "Users can insert their own credits"
      ON user_credits
      FOR INSERT
      WITH CHECK (auth.jwt()->>'sub' = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_credits' AND policyname = 'Users can update their own credits'
  ) THEN
    CREATE POLICY "Users can update their own credits"
      ON user_credits
      FOR UPDATE
      USING (auth.jwt()->>'sub' = user_id)
      WITH CHECK (auth.jwt()->>'sub' = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'credit_transactions' AND policyname = 'Users can view their own credit transactions'
  ) THEN
    CREATE POLICY "Users can view their own credit transactions"
      ON credit_transactions
      FOR SELECT
      USING (auth.jwt()->>'sub' = user_id);
  END IF;

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
