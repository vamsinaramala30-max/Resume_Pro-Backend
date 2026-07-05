export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  // Required: cross-site cookie for refresh token
  sameSite: "none",
  // Use root path so cookie is available to /api/auth/refresh, /api/auth/logout, etc.
  path: "/",
  // Domain is optional; set via env when deploying across subdomains
  domain: process.env.COOKIE_DOMAIN || undefined,
  // maxAge set dynamically where needed
};


export function getCorsAllowedOrigins() {
  const env = process.env.FRONTEND_URLS;
  if (env) {
    return env.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (process.env.FRONTEND_URL) return [process.env.FRONTEND_URL];
  return [];
}

