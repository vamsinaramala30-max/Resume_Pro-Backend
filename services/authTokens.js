import jwt from "jsonwebtoken";
import crypto from "crypto";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

export function signAccessToken({ userId, role }) {
  const secret = requireEnv("JWT_SECRET");
  const expiresIn = process.env.JWT_ACCESS_TTL || "15m";
  return jwt.sign({ id: userId, role }, secret, { expiresIn });
}

export function verifyAccessToken(token) {
  const secret = requireEnv("JWT_SECRET");
  return jwt.verify(token, secret);
}

// Hash a string (for OTP storage)
export async function hashString(str) {
  const salt = await import("bcryptjs").then((bcrypt) => bcrypt.genSalt(12));
  return bcrypt.hash(str, salt);
}

// Create access and refresh tokens
export function createTokens(userId, email, jwtSecret, refreshSecret) {
  const accessToken = jwt.sign(
    { userId, email },
    jwtSecret,
    { expiresIn: process.env.JWT_ACCESS_TTL || "15m" }
  );

  const refreshToken = jwt.sign(
    { userId, email, type: "refresh" },
    refreshSecret,
    { expiresIn: process.env.JWT_REFRESH_TTL || "7d" }
  );

  return { accessToken, refreshToken };
}

// Hash token for storage (for refresh token rotation)
export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Clear auth cookies
export function clearAuthCookies(res) {
  res.cookie("refreshToken", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
  });
}

