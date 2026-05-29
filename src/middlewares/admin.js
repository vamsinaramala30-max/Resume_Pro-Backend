import User from "../../models/user.js";

export async function admin(req, res, next) {
  try {
    const user = await User.findById(req.user.id).select("role");
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admin only" });
    }
    return next();
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

