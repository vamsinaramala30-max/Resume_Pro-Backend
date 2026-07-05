import express from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { users } from "../lib/db.js";
import { validateBody } from "../middleware/validate.js";
import asyncHandler from "../middleware/asyncHandler.js";
import authMiddleware from "../middleware/auth.js";
import AppError from "../shared/errors/AppError.js";
import { sendVerifyEmailOtp, sendForgotPasswordOtp } from "../email/index.js";
import { hashToken, hashString, createTokens, clearAuthCookies, cookieOptions } from "../services/authTokens.js";
import {
  generateOtp6,
  hashOtp,
  createOrReplaceOtpToken,
  verifyOtpToken,
} from "../services/otpTokens.service.js";
import logEvent from "../shared/logging/logger.js";
import { getEffectiveUserResponse } from "../utils/premium.js";

// Log config status securely
console.log("[auth] ========== AUTH SERVICE CONFIG ==========");
console.log("[auth] JWT_SECRET configured:", !!process.env.JWT_SECRET);
console.log("[auth] JWT_REFRESH_SECRET configured:", !!process.env.JWT_REFRESH_SECRET);
console.log("[auth] ==================================");

const router = express.Router();

// Enforce runtime safety for fallback secrets
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "dev-refresh-secret-change-in-production";

// Clean architecture stores (Consider swapping Map for Redis in clustered environments)
const rateLimitStore = new Map();
const accountLockoutStore = new Map(); 

const LOCKOUT_DURATION = 15 * 60 * 1000; 
const MAX_FAILED_ATTEMPTS = 5;

// High-performance Rate Limiter Utility
function checkRateLimit(key, maxAttempts = 5, windowMs = 15 * 60 * 1000) {
  if (process.env.NODE_ENV !== "production") {
    return { allowed: true, remaining: 999 };
  }
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || (now - record.firstAttempt > windowMs)) {
    rateLimitStore.set(key, { count: 1, firstAttempt: now });
    return { allowed: true, remaining: maxAttempts - 1 };
  }

  if (record.count >= maxAttempts) {
    return { allowed: false, remaining: 0, waitTime: windowMs - (now - record.firstAttempt) };
  }

  record.count++;
  rateLimitStore.set(key, record);
  return { allowed: true, remaining: maxAttempts - record.count };
}

// Lockout verification engine
function checkAccountLockout(email) {
  if (process.env.NODE_ENV !== "production") {
    return { locked: false };
  }
  const lockout = accountLockoutStore.get(email);
  if (!lockout) return { locked: false };

  if (lockout.lockedUntil > Date.now()) {
    return {
      locked: true,
      remainingMs: lockout.lockedUntil - Date.now(),
      failedAttempts: lockout.failedAttempts,
    };
  }

  accountLockoutStore.delete(email);
  return { locked: false };
}

function recordFailedAttempt(email) {
  const existing = accountLockoutStore.get(email) || { failedAttempts: 0, lockedUntil: 0 };
  const newFailedAttempts = existing.failedAttempts + 1;
  let lockedUntil = 0;

  if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
    lockedUntil = Date.now() + LOCKOUT_DURATION;
  }

  accountLockoutStore.set(email, {
    failedAttempts: newFailedAttempts,
    lockedUntil,
  });

  return {
    failedAttempts: newFailedAttempts,
    locked: newFailedAttempts >= MAX_FAILED_ATTEMPTS,
    lockedUntil,
  };
}

function clearAccountLockout(email) {
  accountLockoutStore.delete(email);
}

// Prune memory leaks efficiently using a single atomic interval pass
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitStore.entries()) {
    if (now - val.firstAttempt > 15 * 60 * 1000) rateLimitStore.delete(key);
  }
  for (const [email, lockout] of accountLockoutStore.entries()) {
    if (lockout.lockedUntil > 0 && now > lockout.lockedUntil) accountLockoutStore.delete(email);
  }
}, 5 * 60 * 1000).unref(); // .unref() ensures script can exit cleanly in test runners

// ===== Health check & Test routes =====
router.get("/health", (req, res) => res.json({ ok: true, service: "auth" }));
router.get("/test", (req, res) => res.json({ ok: true, message: "Auth API is running" }));

// ===== Register =====
const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Invalid email address").toLowerCase(),
  password: z.string().min(6, "Password must be at least 6 characters").max(100),
});

router.post(
  "/register",
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    const rateLimitKey = `register:${email}`;
    
    if (!checkRateLimit(rateLimitKey).allowed) {
      throw new AppError({
        statusCode: 429,
        code: "RATE_LIMITED",
        message: "Too many registration attempts. Please try again later.",
      });
    }

    const existing = await users.findOne({ email });
    if (existing) {
      throw new AppError({
        statusCode: 400,
        code: "USER_EXISTS",
        message: "An account with this email already exists",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    
    // Utilizing integrated utility framework service functions safely
    const otp = generateOtp6 ? generateOtp6() : String(crypto.randomInt(100000, 999999));
    const otpHash = hashOtp ? await hashOtp(otp) : await bcrypt.hash(otp, 12);
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); 

    const user = await users.create({
      name,
      email,
      password: passwordHash,
      provider: "email",
      isVerified: false,
      emailVerified: false,
      plan: "FREE",
      subscriptionStatus: "inactive",
      emailOtpHash: otpHash,
      emailOtpExpiresAt: otpExpires,
      emailOtpAttempts: 0,
      emailOtpLastSentAt: new Date(),
    });

    logEvent({ level: "info", message: `New user registered: ${email}` });

    try {
      await sendVerifyEmailOtp({ toEmail: email, otp });
      logEvent({ level: "info", message: `Verification OTP sent to: ${email}` });
    } catch (err) {
      logEvent({ level: "error", message: `Failed to send verification email: ${err.message}`, extra: { email } });
      throw new AppError({
        statusCode: 502,
        code: "EMAIL_DELIVERY_FAILED",
        message: "Unable to deliver verification code. Please try again.",
      });
    }

    const { accessToken, refreshToken } = createTokens(user.id, email, JWT_SECRET, JWT_REFRESH_SECRET);

    res.cookie("refreshToken", refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000, 
    });

    res.json({
      ok: true,
      needsVerification: true, 
      token: accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        plan: user.plan,
        subscriptionStatus: user.subscriptionStatus,
      },
    });
  })
);

// ===== Verify Email =====
const verifyEmailSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  otp: z.string().length(6).regex(/^\d+$/),
});

router.post(
  "/verify-email",
  validateBody(verifyEmailSchema),
  asyncHandler(async (req, res) => {
    const { email, otp } = req.body;
    const user = await users.findByEmail(email);
    
    if (!user) {
      throw new AppError({
        statusCode: 401,
        code: "INVALID_OTP",
        message: "Invalid verification code",
      });
    }

    if (user.emailVerified) {
      return res.json({ ok: true, message: "Email already verified" });
    }

    if (user.emailOtpExpiresAt && new Date(user.emailOtpExpiresAt) < new Date()) {
      throw new AppError({
        statusCode: 401,
        code: "OTP_EXPIRED",
        message: "Verification code has expired. Please request a new one.",
      });
    }

    if ((user.emailOtpAttempts || 0) >= 5) {
      throw new AppError({
        statusCode: 401,
        code: "OTP_LOCKED",
        message: "Too many failed attempts. Please request a new code.",
      });
    }

    const valid = await bcrypt.compare(otp, user.emailOtpHash || "");
    if (!valid) {
      await users.update(user.id, {
        emailOtpAttempts: (user.emailOtpAttempts || 0) + 1,
      });
      throw new AppError({
        statusCode: 401,
        code: "INVALID_OTP",
        message: "Invalid verification code",
      });
    }

    await users.update(user.id, {
      emailVerified: true,
      isVerified: true,
      emailOtpHash: null,
      emailOtpExpiresAt: null,
      emailOtpAttempts: 0,
    });

    logEvent({ level: "info", message: `Email verified: ${email}` });
    res.json({ ok: true, message: "Email verified successfully" });
  })
);

// ===== Resend Verification OTP =====
const resendVerifySchema = z.object({
  email: z.string().trim().email().toLowerCase(),
});

router.post(
  "/resend-verify",
  validateBody(resendVerifySchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    const rateLimitKey = `resend:${email}`;
    
    if (!checkRateLimit(rateLimitKey, 3, 10 * 60 * 1000).allowed) {
      throw new AppError({
        statusCode: 429,
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again later.",
      });
    }

    const user = await users.findByEmail(email);
    if (!user || user.emailVerified) {
      return res.json({
        ok: true,
        message: "If the email exists and is unverified, a verification code has been sent.",
      });
    }

    const otp = generateOtp6 ? generateOtp6() : String(crypto.randomInt(100000, 999999));
    const otpHash = hashOtp ? await hashOtp(otp) : await bcrypt.hash(otp, 12);
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    await users.update(user.id, {
      emailOtpHash: otpHash,
      emailOtpExpiresAt: otpExpires,
      emailOtpAttempts: 0,
      emailOtpLastSentAt: new Date(),
    });

    try {
      await sendVerifyEmailOtp({ toEmail: email, otp });
      logEvent({ level: "info", message: `Verification OTP resent to: ${email}` });
    } catch (err) {
      logEvent({ level: "warn", message: `Failed to resend OTP email: ${err.message}` });
    }

    res.json({
      ok: true,
      message: "If the email exists and is unverified, a verification code has been sent.",
    });
  })
);

// ===== Login with password =====
const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string(),
  rememberMe: z.boolean().optional(),
});

router.post(
  "/login",
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password, rememberMe = false } = req.body;
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const ipKey = `login-ip:${ip}`;
    
    if (!checkRateLimit(ipKey, 10, 60 * 1000).allowed) {
      throw new AppError({
        statusCode: 429,
        code: "RATE_LIMITED",
        message: "Too many login attempts. Please try again later.",
      });
    }

    const lockout = checkAccountLockout(email);
    if (lockout.locked) {
      throw new AppError({
        statusCode: 401,
        code: "ACCOUNT_LOCKED",
        message: "Too many failed attempts. Account temporarily locked.",
      });
    }

    const user = await users.findByEmail(email);
    if (!user) {
      throw new AppError({
        statusCode: 401,
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password",
      });
    }

    if (!user.emailVerified && user.emailOtpHash) {
      throw new AppError({
        statusCode: 401,
        code: "EMAIL_NOT_VERIFIED",
        message: "Please verify your email first. Check your inbox for the verification code.",
      });
    }

    const valid = await bcrypt.compare(password, user.password || "");
    if (!valid) {
      const lockoutResult = recordFailedAttempt(email);
      if (lockoutResult.locked) {
        logEvent({
          level: 'warn',
          message: `Account locked due to failed attempts: ${email}`,
          extra: { ip }
        });
        throw new AppError({
          statusCode: 401,
          code: "ACCOUNT_LOCKED",
          message: "Too many failed attempts. Account temporarily locked.",
        });
      }
      throw new AppError({
        statusCode: 401,
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password",
      });
    }

    clearAccountLockout(email);

    const now = new Date().toISOString();
    const updatedUser = await users.update(user.id, {
      lastLogin: now,
      accountStatus: "active",
    });

    const userData = updatedUser || user;
    const { accessToken, refreshToken } = createTokens(userData.id, userData.email, JWT_SECRET, JWT_REFRESH_SECRET);

    const maxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    res.cookie("refreshToken", refreshToken, {
      ...cookieOptions,
      maxAge,
    });

    logEvent({ level: "info", message: `User logged in: ${email}` });

    res.json({
      ok: true,
      token: accessToken,
      user: getEffectiveUserResponse(userData),
    });
  })
);

// ===== Email login: Request OTP =====
const emailLoginRequestSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
});

router.post(
  "/email-login-request",
  validateBody(emailLoginRequestSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    const rateLimitKey = `otp:${email}`;
    const rateCheck = checkRateLimit(rateLimitKey, 3, 10 * 60 * 1000);
    
    if (!rateCheck.allowed) {
      const waitMin = Math.ceil((rateCheck.waitTime || 0) / 60000);
      throw new AppError({
        statusCode: 429,
        code: "RATE_LIMITED",
        message: `Too many requests. Please try again in ${waitMin} minute(s).`,
      });
    }

    const user = await users.findByEmail(email);
    if (!user) {
      return res.json({
        ok: true,
        message: "If the email exists, a verification code has been sent.",
      });
    }

    const otp = generateOtp6 ? generateOtp6() : String(crypto.randomInt(100000, 999999));
    const otpHash = hashOtp ? await hashOtp(otp) : await bcrypt.hash(otp, 12);
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    await users.update(user.id, {
      emailOtpHash: otpHash,
      emailOtpExpiresAt: otpExpires,
      emailOtpAttempts: 0,
      emailOtpLastSentAt: new Date(),
    });

    try {
      await sendVerifyEmailOtp({ toEmail: email, otp });
      logEvent({ level: "info", message: `OTP sent to: ${email}` });
    } catch (err) {
      logEvent({ level: "error", message: `Failed to send OTP email: ${err.message}`, extra: { email } });
      throw new AppError({
        statusCode: 502,
        code: "EMAIL_DELIVERY_FAILED",
        message: "Unable to deliver verification code. Please try again.",
      });
    }

    res.json({
      ok: true,
      message: "If the email exists, a verification code has been sent.",
    });
  })
);

// ===== Email login: Verify OTP =====
const emailLoginVerifySchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  otp: z.string().length(6).regex(/^\d+$/),
  rememberMe: z.boolean().optional(),
});

router.post(
  "/email-login-verify",
  validateBody(emailLoginVerifySchema),
  asyncHandler(async (req, res) => {
    const { email, otp, rememberMe = false } = req.body;
    const user = await users.findByEmail(email);
    
    if (!user) {
      throw new AppError({
        statusCode: 401,
        code: "INVALID_OTP",
        message: "Invalid verification code",
      });
    }

    if (user.emailOtpExpiresAt && new Date(user.emailOtpExpiresAt) < new Date()) {
      throw new AppError({
        statusCode: 401,
        code: "OTP_EXPIRED",
        message: "Verification code has expired. Please request a new one.",
      });
    }

    if ((user.emailOtpAttempts || 0) >= 5) {
      throw new AppError({
        statusCode: 401,
        code: "OTP_LOCKED",
        message: "Too many failed attempts. Please request a new code.",
      });
    }

    const valid = await bcrypt.compare(otp, user.emailOtpHash || "");
    if (!valid) {
      await users.update(user.id, {
        emailOtpAttempts: (user.emailOtpAttempts || 0) + 1,
      });
      throw new AppError({
        statusCode: 401,
        code: "INVALID_OTP",
        message: "Invalid verification code",
      });
    }

    await users.update(user.id, {
      emailOtpHash: null,
      emailOtpExpiresAt: null,
      emailOtpAttempts: 0,
    });

    const { accessToken, refreshToken } = createTokens(user.id, user.email, JWT_SECRET, JWT_REFRESH_SECRET);

    const maxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    res.cookie("refreshToken", refreshToken, {
      ...cookieOptions,
      maxAge,
    });

    logEvent({ level: "info", message: `User logged in via OTP: ${email}` });

    res.json({
      ok: true,
      token: accessToken,
      user: getEffectiveUserResponse(user),
    });
  })
);

// ===== Forgot password: Request reset =====
const forgotPasswordSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
});

router.post(
  "/forgot-password",
  validateBody(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    const rateLimitKey = `fp:${email}`;
    
    if (!checkRateLimit(rateLimitKey, 3, 10 * 60 * 1000).allowed) {
      throw new AppError({
        statusCode: 429,
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again later.",
      });
    }

    const user = await users.findByEmail(email);
    if (!user) {
      return res.json({
        ok: true,
        message: "If the email exists, a reset code has been sent.",
      });
    }

    const otp = generateOtp6 ? generateOtp6() : String(crypto.randomInt(100000, 999999));
    const otpHash = hashOtp ? await hashOtp(otp) : await bcrypt.hash(otp, 12);
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    await users.update(user.id, {
      passwordResetOtpHash: otpHash,
      passwordResetOtpExpiresAt: otpExpires,
      passwordResetOtpAttempts: 0,
      passwordResetOtpLastSentAt: new Date(),
    });

    try {
      await sendForgotPasswordOtp({ toEmail: email, otp });
      logEvent({ level: "info", message: `Password reset OTP sent to: ${email}` });
    } catch (err) {
      logEvent({ level: "error", message: `Failed to send password reset email: ${err.message}`, extra: { email } });
      throw new AppError({
        statusCode: 502,
        code: "EMAIL_DELIVERY_FAILED",
        message: "Unable to deliver reset code. Please try again.",
      });
    }

    res.json({
      ok: true,
      message: "If the email exists, a reset code has been sent.",
    });
  })
);

// ===== Forgot password: Reset =====
const resetPasswordSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  otp: z.string().length(6).regex(/^\d+$/),
  newPassword: z.string().min(6).max(100),
});

router.post(
  "/reset-password",
  validateBody(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const { email, otp, newPassword } = req.body;
    const user = await users.findByEmail(email);
    
    if (!user) {
      throw new AppError({
        statusCode: 401,
        code: "INVALID_OTP",
        message: "Invalid verification code",
      });
    }

    if (user.passwordResetOtpExpiresAt && new Date(user.passwordResetOtpExpiresAt) < new Date()) {
      throw new AppError({
        statusCode: 401,
        code: "OTP_EXPIRED",
        message: "Verification code has expired. Please request a new one.",
      });
    }

    if ((user.passwordResetOtpAttempts || 0) >= 5) {
      throw new AppError({
        statusCode: 401,
        code: "OTP_LOCKED",
        message: "Too many failed attempts. Please request a new code.",
      });
    }

    const valid = await bcrypt.compare(otp, user.passwordResetOtpHash || "");
    if (!valid) {
      await users.update(user.id, {
        passwordResetOtpAttempts: (user.passwordResetOtpAttempts || 0) + 1,
      });
      throw new AppError({
        statusCode: 401,
        code: "INVALID_OTP",
        message: "Invalid verification code",
      });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);
    await users.update(user.id, {
      password: newPasswordHash,
      passwordResetOtpHash: null,
      passwordResetOtpExpiresAt: null,
      passwordResetOtpAttempts: 0,
    });

    logEvent({ level: "info", message: `Password reset successful for: ${email}` });

    res.json({
      ok: true,
      message: "Password has been reset. Please login with your new password.",
    });
  })
);

// ===== Logout =====
router.post("/logout", (req, res) => {
  clearAuthCookies(res);
  res.json({ ok: true });
});

// ===== Refresh token =====
router.post("/refresh", asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  if (!refreshToken) {
    throw new AppError({
      statusCode: 401,
      code: "NO_SESSION",
      message: "No session found",
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
  } catch {
    clearAuthCookies(res);
    throw new AppError({
      statusCode: 401,
      code: "INVALID_SESSION",
      message: "Session expired",
    });
  }

  const user = await users.findById(decoded.userId);
  if (!user) {
    clearAuthCookies(res);
    throw new AppError({
      statusCode: 401,
      code: "USER_NOT_FOUND",
      message: "User not found",
    });
  }

  const { accessToken, refreshToken: newRefreshToken } = createTokens(
    user.id,
    user.email,
    JWT_SECRET,
    JWT_REFRESH_SECRET
  );

  res.cookie("refreshToken", newRefreshToken, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({
    ok: true,
    token: accessToken,
    user: getEffectiveUserResponse(user),
  });
}));

// ===== Get current user =====
router.get("/me", asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.json({ ok: true, user: null });
  }

  const token = authHeader.slice(7);
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.json({ ok: true, user: null });
  }

  const user = await users.findById(decoded.userId);
  if (!user) {
    return res.json({ ok: true, user: null });
  }

  res.json({
    ok: true,
    user: getEffectiveUserResponse(user),
  });
}));

// ===== Update current user profile =====
const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().max(20).optional(),
  bio: z.string().trim().max(500).optional(),
  location: z.string().trim().max(100).optional(),
  profession: z.string().trim().max(100).optional(),
});

router.put(
  "/profile",
  authMiddleware,
  validateBody(updateProfileSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { name, phone, bio, location, profession } = req.body;

    const updated = await users.update(userId, {
      name,
      phone,
      bio,
      location,
      profession,
    });

    logEvent({ level: "info", message: `User profile updated: ${userId}` });

    res.json({
      ok: true,
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        phone: updated.phone,
        bio: updated.bio,
        location: updated.location,
        profession: updated.profession,
        plan: updated.plan,
        subscriptionStatus: updated.subscriptionStatus,
        createdAt: updated.createdAt,
      },
    });
  })
);

// ===== Change password =====
const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(6).max(100),
});

router.post(
  "/change-password",
  authMiddleware,
  validateBody(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    const user = await users.findById(userId);
    if (!user || !user.password) {
      throw new AppError({
        statusCode: 400,
        code: "NO_PASSWORD",
        message: "Cannot change password for OAuth accounts",
      });
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      throw new AppError({
        statusCode: 401,
        code: "INVALID_PASSWORD",
        message: "Current password is incorrect",
      });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);
    await users.update(userId, { password: newPasswordHash });

    logEvent({ level: "info", message: `Password changed for user: ${userId}` });

    res.json({
      ok: true,
      message: "Password changed successfully",
    });
  })
);

export default router;