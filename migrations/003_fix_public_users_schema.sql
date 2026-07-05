-- Fix Supabase schema mismatch for auth/user table references.
-- Error seen: Could not find the table 'public.users' in the schema cache.
-- This migration ensures that the expected public.users table exists and
-- that auth/token tables reference it.

-- 1) Ensure required extensions exist
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2) Create users table if missing (must match backend expectations)
-- If your Supabase project already has auth.users, do NOT interfere with it.
-- This creates a separate application table: public.users.
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  email TEXT UNIQUE NOT NULL,
  provider TEXT DEFAULT 'email' CHECK (provider IN ('google', 'email')),
  google_id TEXT UNIQUE,
  avatar TEXT,
  is_verified BOOLEAN DEFAULT true,
  password TEXT,
  role TEXT DEFAULT 'user',
  plan TEXT DEFAULT 'FREE' CHECK (plan IN ('FREE', 'PRO', 'TEAM')),
  subscription_status TEXT DEFAULT 'inactive' CHECK (subscription_status IN ('active', 'inactive', 'canceled', 'past_due')),
  subscription_start_date TIMESTAMPTZ,
  subscription_end_date TIMESTAMPTZ,
  refresh_token_hash TEXT,

  email_otp_hash TEXT,
  email_otp_expires_at TIMESTAMPTZ,
  email_otp_attempts INTEGER DEFAULT 0,
  email_otp_last_sent_at TIMESTAMPTZ,

  password_reset_otp_hash TEXT,
  password_reset_otp_expires_at TIMESTAMPTZ,
  password_reset_otp_attempts INTEGER DEFAULT 0,
  password_reset_otp_last_sent_at TIMESTAMPTZ,

  email_verified BOOLEAN DEFAULT false,

  account_status TEXT DEFAULT 'active',
  phone TEXT,
  bio TEXT,
  location TEXT,
  profession TEXT,

  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3) Indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_provider ON public.users(provider);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON public.users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_plan ON public.users(plan);
CREATE INDEX IF NOT EXISTS idx_users_subscription_status ON public.users(subscription_status);
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON public.users(email_verified);
CREATE INDEX IF NOT EXISTS idx_users_refresh_token_hash ON public.users(refresh_token_hash);

-- 4) updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at'
  ) THEN
    CREATE TRIGGER update_users_updated_at
      BEFORE UPDATE ON public.users
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- 5) Ensure token tables exist and reference public.users(id)
-- (If migrations 002 already ran, these are no-ops.)
CREATE TABLE IF NOT EXISTS public.email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used BOOLEAN NOT NULL DEFAULT false,
  resend_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evt_user_id ON public.email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_evt_expires_at ON public.email_verification_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_evt_used ON public.email_verification_tokens(used);

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used BOOLEAN NOT NULL DEFAULT false,
  resend_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prt_user_id ON public.password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_prt_expires_at ON public.password_reset_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_prt_used ON public.password_reset_tokens(used);

-- 6) Enable RLS if not already enabled (safe to re-run)
ALTER TABLE public.email_verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- 7) RLS policies for service_role access (idempotent-ish)
-- If a policy already exists with same name, Postgres will error; so we guard by using DO blocks.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_verification_tokens' AND policyname='Service role can access email verification tokens'
  ) THEN
    CREATE POLICY "Service role can access email verification tokens"
      ON public.email_verification_tokens
      FOR ALL
      USING (auth.jwt() ->> 'role' = 'service_role')
      WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='password_reset_tokens' AND policyname='Service role can access password reset tokens'
  ) THEN
    CREATE POLICY "Service role can access password reset tokens"
      ON public.password_reset_tokens
      FOR ALL
      USING (auth.jwt() ->> 'role' = 'service_role')
      WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
  END IF;
END $$;

-- 8) Optional view for frontend compatibility (idempotent)
CREATE OR REPLACE VIEW public.user_profiles AS
SELECT
  id,
  name,
  email,
  provider,
  avatar,
  is_verified,
  role,
  plan,
  subscription_status,
  subscription_start_date,
  subscription_end_date,
  email_verified,
  created_at,
  updated_at
FROM public.users;
