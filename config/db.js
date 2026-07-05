import mongoose from "mongoose";

const connectDB = async () => {
  try {
    // Debug check
    console.log("MONGO_URI:", process.env.MONGO_URI);

    // Connect MongoDB
    await mongoose.connect(process.env.MONGO_URI);

    console.log("✅ MongoDB Connected Successfully");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error.message);

    // Stop server if DB fails
    process.exit(1);
  }
};

export default connectDB;
