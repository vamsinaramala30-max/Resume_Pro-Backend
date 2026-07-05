export function errorHandler(err, req, res, next) {
  // eslint-disable-line no-unused-vars
  const status = err.statusCode || err.status || 500;
  const message = err.expose ? err.message : "Internal Server Error";

  // Avoid stack traces in responses
  if (process.env.NODE_ENV === "production") {
    return res.status(status).json({
      success: false,
      message,
    });
  }

  return res.status(status).json({
    success: false,
    message,
    // Provide error details only in non-prod
    error: err.message,
  });
}

