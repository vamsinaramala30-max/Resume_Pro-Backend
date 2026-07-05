import express from "express";
import { users, resumes } from "../lib/db.js";
import auth from "../middleware/auth.js";
import admin from "../middleware/admin.js";

const router = express.Router();

router.get("/stats", auth, admin, async (req, res) => {
  try {
    const userCount = await users.count();
    const resumeCount = await resumes.count();

    res.json({ users: userCount, resumes: resumeCount });

  } catch {
    res.status(500).json({ msg: "Server error" });
  }
});

export default router;