import express from "express";
import User from "../models/user.js";
import Resume from "../models/resume.js";
import auth from "../middleware/auth.js";
import admin from "../middleware/admin.js";

const router = express.Router();

router.get("/stats", auth, admin, async (req, res) => {
  try {
    const users = await User.countDocuments();
    const resumes = await Resume.countDocuments();

    res.json({ users, resumes });

  } catch {
    res.status(500).json({ msg: "Server error" });
  }
});

export default router;