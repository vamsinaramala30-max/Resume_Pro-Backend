import User from "../models/user.js";

const admin = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user || user.role !== "admin") {
      return res.status(403).json({ msg: "Admin only" });
    }

    next();
  } catch (err) {
    res.status(500).json({ msg: "Server error" });
  }
};

export default admin;