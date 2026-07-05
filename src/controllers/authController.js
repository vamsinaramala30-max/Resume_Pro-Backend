import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../../models/user.js";

export async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;

    const hash = await bcrypt.hash(password, 10);
    const user = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hash,
    });

    await user.save();
    return res.json({ success: true, message: "Registered ✅" });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ success: false, message: "Email already in use" });
    }
    return next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(400).json({ success: false, message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Wrong password" });
    }

    const token = jwt.sign({ id: user._id.toString(), role: user.role }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    return res.json({ success: true, token });
  } catch (err) {
    return next(err);
  }
}

