import logEvent from "../shared/logging/logger.js";

export default function requestLoggingMiddleware(req, res, next) {
  const start = process.hrtime.bigint();

  const userId = req.user?.id || req.user?.userId;

  res.on("finish", () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;

    logEvent({
      level: res.statusCode >= 500 ? "error" : "info",
      message: `${req.method} ${req.originalUrl}`,
      requestId: req.requestId,
      extra: {
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        userId,
      },
    });
  });

  next();
}

