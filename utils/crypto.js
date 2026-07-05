import crypto from "crypto";

export function randomOtp({ length = 6 } = {}) {
  // Numeric OTP with fixed length (no leading zeros exclusion)
  const max = 10 ** length;
  const n = crypto.randomInt(0, max);
  return String(n).padStart(length, "0");
}

export function sha256(data) {
  return crypto.createHash("sha256").update(String(data)).digest("hex");
}

export function nowMs() {
  return Date.now();
}

export function addMinutes(msOrDate, minutes) {
  const base = typeof msOrDate === "number" ? msOrDate : msOrDate.getTime();
  return new Date(base + minutes * 60 * 1000);
}

export function addDays(msOrDate, days) {
  const base = typeof msOrDate === "number" ? msOrDate : msOrDate.getTime();
  return new Date(base + days * 24 * 60 * 60 * 1000);
}

