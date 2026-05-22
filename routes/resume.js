import express from "express";
import Resume from "../models/resume.js";
import authMiddleware from "../middleware/auth.js";

const router = express.Router();

router.post("/save", authMiddleware, async (req, res) => {
  const resume = new Resume({
    userId: req.user.id,
    payload: req.body?.payload ?? req.body,
    title: req.body?.title ?? "",
    premium: Boolean(req.body?.premium),
  });

  await resume.save();

  res.json({ message: "Saved to Cloud ✅", resume });
});

// Get only the authenticated user's saved resumes
router.get("/me", authMiddleware, async (req, res) => {
  const data = await Resume.find({ userId: req.user.id }).sort({ createdAt: -1 });
  res.json(data);
});

// Delete only if the resume belongs to the authenticated user
router.delete("/:id", authMiddleware, async (req, res) => {
  const deleted = await Resume.findOneAndDelete({
    _id: req.params.id,
    userId: req.user.id,
  });

  if (!deleted) return res.status(404).json({ error: "Resume not found" });
  res.json({ message: "Deleted ✅" });
});


export default router;