import mongoose from "mongoose";

const resumeSchema = new mongoose.Schema(
  {
    userId: { type: String, index: true },

    // Store the full resume payload as provided by the frontend.
    // This keeps backend schema compatible with evolving UI.
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Lightweight metadata for list/search.
    title: { type: String, default: "" },
    premium: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.models.Resume || mongoose.model("Resume", resumeSchema);

