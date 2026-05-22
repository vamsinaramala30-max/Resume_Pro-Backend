import express from "express";

const router = express.Router();

router.post("/suggest", async (req, res) => {
  try {
    const { text } = req.body;

    res.json({
      result: "✨ Improved: " + text
    });

  } catch {
    res.status(500).json({ msg: "AI error" });
  }
});

export default router;