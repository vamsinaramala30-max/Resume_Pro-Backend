import express from "express";
import User from "../../models/user.js";
import Resume from "../../models/resume.js";
import { auth } from "../middlewares/auth.js";
import { admin } from "../middlewares/admin.js";

const router = express.Router();

router.get("/stats", auth, admin, async (req, res, next) => {
  try {
    const users = await User.countDocuments().lean();
    const resumes = await Resume.countDocuments().lean();
    return res.json({ success: true, users, resumes });
  } catch (err) {
    return next(err);
  }
});

export default router;

