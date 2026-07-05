import AppError from "../shared/errors/AppError.js";

// Ensures we have access to the raw body buffer for signature verification.
// Use with `express.raw({ type: 'application/json' })`.
export default function rawBodyJsonMiddleware(req, res, next) {
  try {
    // Express raw() sets req.body as Buffer.
    if (!req.body || !Buffer.isBuffer(req.body)) {
      throw new AppError({
        statusCode: 500,
        code: "WEBHOOK_RAW_BODY_MISSING",
        message: "Raw body not available for webhook",
        expose: false,
      });
    }

    req.rawBody = req.body;
    next();
  } catch (err) {
    next(err);
  }
}

