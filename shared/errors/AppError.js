export default class AppError extends Error {
  constructor({ statusCode = 500, code = "INTERNAL_ERROR", message = "Internal Server Error", expose = false, details } = {}) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.expose = expose;
    this.details = details;
  }
}

