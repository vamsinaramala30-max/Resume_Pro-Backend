import { errorResponse } from "../shared/responses/responseEnvelope.js";
import AppError from "../shared/errors/AppError.js";

export default function errorHandler(err, req, res, next) {
  const status = err?.statusCode || err?.status || 500;
  const code = err?.code || "INTERNAL_ERROR";
  const requestId = req?.requestId;

  const isZodLike = err?.name === "ZodError" || err?.issues;
  const details = err?.details || (isZodLike ? err?.flatten?.() : undefined);

  const expose = Boolean(err?.expose);
  const message = expose ? err?.message : "Internal Server Error";

  if (status >= 500) {
    console.error("[ERROR]", {
      message: err?.message,
      code: err?.code,
      status,
      path: req?.originalUrl,
      requestId,
    });
  }

  const payload = errorResponse({
    message,
    code,
    details: details ? { ...details } : undefined,
    requestId,
  });

  res.status(status).json(payload);
}


