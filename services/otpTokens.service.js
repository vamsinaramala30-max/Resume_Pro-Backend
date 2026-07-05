import bcrypt from "bcryptjs";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

const OTP_TABLES = {
  emailVerification: "email_verification_tokens",
  passwordReset: "password_reset_tokens",
};

export function isSupabaseReady() {
  return !!supabaseAdmin;
}

export function generateOtp6() {
  const otp = crypto.randomInt(0, 1000000).toString().padStart(6, "0");
  return otp;
}

export async function hashOtp(otp) {
  // bcrypt is fine for OTP hashing; use fixed cost for performance
  return bcrypt.hash(otp, 12);
}

export async function verifyOtpAgainstHash(otp, otpHash) {
  if (!otpHash) return false;
  return bcrypt.compare(otp, otpHash);
}

export async function invalidatePreviousOtps({ userId, tokenType }) {
  if (!supabaseAdmin) throw new Error("Supabase is not configured for OTP storage");

  const table = OTP_TABLES[tokenType];
  // Invalidate by marking used=true for active/valid tokens
  // This prevents race condition reuse.
  const nowIso = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from(table)
    .update({ used: true })
    .eq("user_id", userId)
    .lte("expires_at", nowIso);

  // If it fails, it's critical because tokens will not behave predictably.
  if (error) {
    throw new Error(`Failed to invalidate previous OTP tokens: ${error.message}`);
  }
}

function otpTokenTable(tokenType) {
  const table = OTP_TABLES[tokenType];
  if (!table) throw new Error(`Invalid tokenType: ${tokenType}`);
  return table;
}

export async function createOtpToken({
  userId,
  tokenType,
  otpHash,
  expiresAt,
}) {
  if (!supabaseAdmin) throw new Error("Supabase is not configured for OTP storage");

  const table = otpTokenTable(tokenType);

  const { data, error } = await supabaseAdmin
    .from(table)
    .insert({
      user_id: userId,
      otp_hash: otpHash,
      expires_at: expiresAt,
      attempts: 0,
      used: false,
      resend_count: 0,
    })
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to create OTP token: ${error.message}`);
  }

  if (!data) throw new Error("Failed to create OTP token");
  return data;
}

export async function getActiveTokenRow({
  userId,
  tokenType,
}) {
  if (!supabaseAdmin) throw new Error("Supabase is not configured for OTP storage");

  const table = otpTokenTable(tokenType);

  // Get latest unused OTP for user
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from(table)
    .select("id, otp_hash, expires_at, attempts, used, resend_count")
    .eq("user_id", userId)
    .eq("used", false)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch OTP token: ${error.message}`);
  }

  return data;
}

export async function markOtpUsed({
  userId,
  tokenType,
}) {
  if (!supabaseAdmin) throw new Error("Supabase is not configured for OTP storage");

  const table = otpTokenTable(tokenType);

  const nowIso = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from(table)
    .update({ used: true })
    .eq("user_id", userId)
    .eq("used", false)
    .gt("expires_at", nowIso);

  if (error) {
    throw new Error(`Failed to mark OTP used: ${error.message}`);
  }
}

export async function incrementOtpAttempts({
  userId,
  tokenType,
}) {
  if (!supabaseAdmin) throw new Error("Supabase is not configured for OTP storage");

  const table = otpTokenTable(tokenType);

  // Atomically increment the latest unused active token for user
  const nowIso = new Date().toISOString();
  const { data: token, error: fetchErr } = await supabaseAdmin
    .from(table)
    .select("id, attempts")
    .eq("user_id", userId)
    .eq("used", false)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchErr) throw new Error(`Failed to fetch OTP token for attempts increment: ${fetchErr.message}`);
  if (!token) return null;

  const { error: updErr } = await supabaseAdmin
    .from(table)
    .update({ attempts: (token.attempts || 0) + 1 })
    .eq("id", token.id);

  if (updErr) {
    throw new Error(`Failed to increment OTP attempts: ${updErr.message}`);
  }

  return { id: token.id, attempts: (token.attempts || 0) + 1 };
}

export async function verifyOtpToken({
  userId,
  tokenType,
  otp,
  maxAttempts = 5,
}) {
  const token = await getActiveTokenRow({ userId, tokenType });
  if (!token) {
    return { ok: false, reason: "OTP_EXPIRED_OR_INVALID" };
  }

  if ((token.attempts || 0) >= maxAttempts) {
    return { ok: false, reason: "OTP_LOCKED" };
  }

  const valid = await verifyOtpAgainstHash(otp, token.otp_hash);
  if (!valid) {
    await incrementOtpAttempts({ userId, tokenType });
    return { ok: false, reason: "INVALID_OTP" };
  }

  // OTP valid: mark used
  await markOtpUsed({ userId, tokenType });
  return { ok: true };
}

export async function createOrReplaceOtpToken({
  userId,
  tokenType,
  otp,
  otpHash,
  expiresAt,
  cooldownMinutes = 1,
  maxResendAttempts = 5,
}) {
  if (!supabaseAdmin) throw new Error("Supabase is not configured for OTP storage");

  const table = otpTokenTable(tokenType);

  // Enforce cooldown: if latest token was created within cooldown and not expired, block resend.
  const now = new Date();
  const cooldownAgo = new Date(now.getTime() - cooldownMinutes * 60 * 1000).toISOString();

  const { data: latest, error: latestErr } = await supabaseAdmin
    .from(table)
    .select("id, created_at, expires_at, used, resend_count")
    .eq("user_id", userId)
    .eq("used", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestErr) {
    throw new Error(`Failed to fetch latest OTP token for resend rules: ${latestErr.message}`);
  }

  if (latest && new Date(latest.created_at) > new Date(cooldownAgo) && new Date(latest.expires_at) > now) {
    const remainingSec = Math.max(0, Math.ceil((new Date(latest.created_at).getTime() + cooldownMinutes * 60 * 1000 - now.getTime()) / 1000));
    return { ok: false, reason: "COOLDOWN", remainingSeconds: remainingSec };
  }

  // Invalidate previous active token to avoid race conditions
  const { error: invErr } = await supabaseAdmin
    .from(table)
    .update({ used: true })
    .eq("user_id", userId)
    .eq("used", false)
    .gt("expires_at", now.toISOString());

  if (invErr) {
    throw new Error(`Failed to invalidate previous OTP token: ${invErr.message}`);
  }

  // Resend attempt counter (soft): if too many resends in recent time window, block.
  if (latest && (latest.resend_count || 0) >= maxResendAttempts) {
    return { ok: false, reason: "RESEND_LIMIT" };
  }

  const row = await createOtpToken({ userId, tokenType, otpHash, expiresAt });
  return { ok: true, row };
}

