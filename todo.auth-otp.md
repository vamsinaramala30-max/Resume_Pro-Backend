# TODO: Resume PRO Auth + OTP + Security (phase 1)

- [x] Install dependencies: helmet, express-rate-limit, zod, nodemailer
- [x] Add cookie + OTP scaffolding utilities/middleware/email templates
- [x] Extend User model fields for verification/reset/refresh
- [x] Replace auth routes with OTP + refresh cookie flow
- [x] Add cookieOptions + security helpers
- [ ] Fix backend server security middleware (Helmet + CORS + centralized errors) and remove dynamic port logic
- [ ] Fix rate limiter IPv6/keyGenerator issues
- [ ] Add resume endpoint validation/pagination + indexes
- [ ] Add logout refresh token rotation revocation correctly (unset should not allow missing)
- [ ] Add OTP brute-force protections (attempt increment + lockout)
- [ ] Add password reset response hardening (avoid enumeration)
- [ ] Add frontend OTP + forgot/reset UI + navigation fixes
- [ ] Add tests (integration + e2e skeleton)

