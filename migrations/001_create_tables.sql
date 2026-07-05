-- Migration: Create tables for Supabase migration from MongoDB
-- Run this in Supabase SQL Editor

-- ================= USERS TABLE =================
CREATE TABLE IF NOT EXISTS users (
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
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_provider ON users(provider);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan);
CREATE INDEX IF NOT EXISTS idx_users_subscription_status ON users(subscription_status);
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email_verified);
CREATE INDEX IF NOT EXISTS idx_users_refresh_token_hash ON users(refresh_token_hash);

-- ================= RESUMES TABLE =================
CREATE TABLE IF NOT EXISTS resumes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payload JSONB DEFAULT '{}',
    title TEXT DEFAULT '',
    premium BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for resumes
CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON resumes(user_id);
CREATE INDEX IF NOT EXISTS idx_resumes_user_created ON resumes(user_id, created_at DESC);

-- ================= PAYMENTS TABLE =================
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id TEXT,
    payment_id TEXT,
    amount INTEGER NOT NULL,
    currency TEXT DEFAULT 'INR',
    plan TEXT NOT NULL CHECK (plan IN ('PRO', 'TEAM')),
    status TEXT DEFAULT 'paid' CHECK (status IN ('created', 'paid', 'failed', 'verified')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for payments
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_id ON payments(payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_user_created ON payments(user_id, created_at DESC);

-- ================= SUBSCRIBERS TABLE =================
CREATE TABLE IF NOT EXISTS subscribers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT DEFAULT '',
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed', 'bounced')),
    source TEXT DEFAULT 'footer',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for subscribers
CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status);

-- ================= ENABLE RLS =================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;

-- ================= RLS POLICIES =================

-- Users: Users can read their own data, Admins can read all
CREATE POLICY "Users can read own data" ON users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can read all users" ON users
    FOR SELECT USING (
        auth.jwt() ->> 'role' = 'admin'
    );

-- Resumes: Users can CRUD their own resumes
CREATE POLICY "Users can insert own resumes" ON resumes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can select own resumes" ON resumes
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own resumes" ON resumes
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own resumes" ON resumes
    FOR DELETE USING (auth.uid() = user_id);

-- Payments: Users can read their own payments
CREATE POLICY "Users can read own payments" ON payments
    FOR SELECT USING (auth.uid() = user_id);

-- Subscribers: Everyone can subscribe, only service role can manage
CREATE POLICY "Anyone can subscribe" ON subscribers
    FOR INSERT WITH CHECK (true);

-- ================= FUNCTION: Handle updated_at =================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_resumes_updated_at BEFORE UPDATE ON resumes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscribers_updated_at BEFORE UPDATE ON subscribers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================= STORAGE TABLES (for Supabase Auth) =================
-- Note: These are managed by Supabase Auth, not custom
-- auth.users is already provided by Supabase

-- ================= VIEW: User profiles for frontend =================
CREATE OR REPLACE VIEW user_profiles AS
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
FROM users;

-- ================= FUNCTION: Get user by email =================
CREATE OR REPLACE FUNCTION get_user_by_email(user_email TEXT)
RETURNS TABLE (
    id UUID,
    email TEXT,
    name TEXT,
    password TEXT,
    role TEXT,
    plan TEXT,
    subscription_status TEXT,
    email_otp_hash TEXT,
    email_otp_expires_at TIMESTAMPTZ,
    email_otp_attempts INTEGER,
    email_otp_last_sent_at TIMESTAMPTZ,
    password_reset_otp_hash TEXT,
    password_reset_otp_expires_at TIMESTAMPTZ,
    password_reset_otp_attempts INTEGER,
    password_reset_otp_last_sent_at TIMESTAMPTZ,
    email_verified BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.id,
        u.email,
        u.name,
        u.password,
        u.role,
        u.plan,
        u.subscription_status,
        u.email_otp_hash,
        u.email_otp_expires_at,
        u.email_otp_attempts,
        u.email_otp_last_sent_at,
        u.password_reset_otp_hash,
        u.password_reset_otp_expires_at,
        u.password_reset_otp_attempts,
        u.password_reset_otp_last_sent_at,
        u.email_verified
    FROM users u
    WHERE u.email = user_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;