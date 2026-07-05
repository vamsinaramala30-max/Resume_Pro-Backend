import jwt from "jsonwebtoken";

export function auth(req, res, next) {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

    if (!token) {
      return res.status(401).json({ success: false, message: "No token" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Shape validation: prevent malformed/poisoned tokens
    if (!decoded || typeof decoded !== "object" || !decoded.id) {
      return res.status(401).json({ success: false, message: "Invalid token payload" });
    }

    req.user = decoded;
    return next();
  } catch (err) {
    const name = err?.name;
    if (name === "TokenExpiredError") {
      return res.status(401).json({ success: false, message: "Token expired" });
    }
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
}

