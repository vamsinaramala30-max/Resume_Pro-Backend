import AppError from "../shared/errors/AppError.js";
import { users } from "../lib/db.js";
import { isActivePremium, isOwnerEmail } from "../utils/premium.js";

export default async function isPremium(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError({ statusCode: 401, code: "UNAUTHENTICATED", message: "Authentication required" });
    }

    const user = await users.findById(userId);
    if (!user) {
      throw new AppError({ statusCode: 401, code: "UNAUTHENTICATED", message: "User not found" });
    }

    if (isOwnerEmail(user.email) || isActivePremium(user)) {
      return next();
    }

    return res.status(403).json({ error: "Premium required" });
  } catch (err) {
    next(err);
  }
}

