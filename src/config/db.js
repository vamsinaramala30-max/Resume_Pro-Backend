import mongoose from "mongoose";

export default async function connectDB() {
  const uri = process.env.MONGO_URI;

  // Fail fast (validateEnv already checks presence, but keep defensive)
  if (!uri) {
    throw new Error("Missing MONGO_URI");
  }

  try {
    // Use modern connection options (mongoose 8 uses sensible defaults)
    await mongoose.connect(uri);
    return mongoose.connection;
  } catch (err) {
    // Avoid leaking secrets
    throw new Error(`Mongo connection failed: ${err?.message || "unknown error"}`);
  }
}

