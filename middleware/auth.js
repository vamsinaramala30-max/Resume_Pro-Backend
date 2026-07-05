import jwt from "jsonwebtoken";
import AppError from "../shared/errors/AppError.js";

function getSecret() {
  return process.env.JWT_SECRET || "dev-secret-change-in-production";
}

export default function authMiddleware(req, res, next) {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      throw new AppError({
        statusCode: 401,
        code: "NO_TOKEN",
        message: "Authentication required",
      });
    }

    const decoded = jwt.verify(token, getSecret());
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role || "user",
    };
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      next(
        new AppError({
          statusCode: 401,
          code: "TOKEN_EXPIRED",
          message: "Session expired. Please login again.",
        })
      );
      return;
    }
    next(
      err.statusCode
        ? err
        : new AppError({
            statusCode: 401,
            code: "INVALID_TOKEN",
            message: "Invalid or expired token",
          })
    );
  }
}