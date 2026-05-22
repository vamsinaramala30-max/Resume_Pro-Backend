import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/user.js";

const router = express.Router();

router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name?.trim() || !email?.trim() || !password?.trim()) {
      return res.status(400).json({ error: "Name, email, and password are required" });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = new User({ name: name.trim(), email: email.toLowerCase().trim(), password: hash });

    await user.save();

    res.json({ message: "Registered ✅" });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: "Email already in use" });
    }
    return res.status(500).json({ error: "Auth register failed", message: err?.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email?.trim() || !password?.trim()) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(400).json({ error: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Wrong password" });

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'fallback-secret', {
      expiresIn: '7d',
    });
    res.json({ token });
  } catch (err) {
    return res.status(500).json({ error: "Auth login failed", message: err?.message });
  }
});

export default router;

