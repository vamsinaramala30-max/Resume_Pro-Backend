import rateLimit from "express-rate-limit";

export const authLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  // Use express-rate-limit defaults for IPv6-safe keying.
  message: { error: "Too many login attempts. Try again later." },
});

export const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  // Use express-rate-limit defaults for IPv6-safe keying.
  message: { error: "Too many requests. Try again later." },
});

export const passwordResetLimiter = rateLimit({
  windowMs: 20 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // Use express-rate-limit defaults for IPv6-safe keying.
  message: { error: "Too many reset attempts. Try again later." },
});

