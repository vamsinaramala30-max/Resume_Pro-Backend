import mongoose from "mongoose";

const connectDB = async () => {
  const configuredUri = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/resumepro";
  const localFallbackUri = "mongodb://127.0.0.1:27017/resumepro";
  const maskedUri = configuredUri.replace(/(mongodb(?:\+srv)?:\/\/)([^:@]+):([^@]+)@/, '$1***:***@');

  const connect = async (uri) => {
    return mongoose.connect(uri, {
      connectTimeoutMS: 10000,
      serverSelectionTimeoutMS: 10000,
    });
  };

  try {
    // Debug check
    console.log("MongoDB URI:", configuredUri.startsWith("mongodb://") || configuredUri.startsWith("mongodb+srv://") ? maskedUri : "(invalid or hidden)");

    if (!configuredUri) {
      throw new Error("MongoDB connection string is not configured. Set MONGO_URI or MONGODB_URI.");
    }

    // Try the configured MongoDB URI first
    await connect(configuredUri);
    console.log("✅ MongoDB Connected Successfully");
  } catch (error) {
    const shouldTryLocalFallback =
      configuredUri !== localFallbackUri &&
      /querySrv ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|URI malformed/i.test(error.message);

    if (shouldTryLocalFallback) {
      console.warn("⚠️ Atlas DNS or network lookup failed; attempting local MongoDB fallback...");
      try {
        await connect(localFallbackUri);
        console.log("✅ MongoDB Connected Successfully (local fallback)");
        return;
      } catch (fallbackError) {
        console.error("❌ Local MongoDB fallback failed:", fallbackError.message);
        process.exit(1);
      }
    }

    console.error("❌ MongoDB Connection Error:", error.message);
    process.exit(1);
  }
};

export default connectDB;