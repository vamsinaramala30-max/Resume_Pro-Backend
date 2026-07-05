import { ZodError } from "zod";
import AppError from "../shared/errors/AppError.js";

// Sanitize HTML/script tags from strings
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// Recursively sanitize an object
function sanitizeObject(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return sanitizeString(obj);
  if (typeof obj === 'number' || typeof obj === 'boolean') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  if (typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }
  return obj;
}

// Input sanitization middleware
export function sanitizeInput(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
}

export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const err = result.error;
      if (err instanceof ZodError) {
        return next(new AppError({
          statusCode: 422,
          code: "VALIDATION_ERROR",
          message: "Invalid request",
          expose: true,
          details: err.flatten(),
        }));
      }
      return next(new AppError({
        statusCode: 422,
        code: "VALIDATION_ERROR",
        message: "Invalid request",
        expose: true,
      }));
    }
    req.body = result.data;
    next();
  };
}

