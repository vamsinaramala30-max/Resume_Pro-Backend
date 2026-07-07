import express from "express";
import { chat, streamChat, improveContent, analyzeATS, generateSummary, suggestMetrics, isAIConfigured } from "../services/ai.service.js";
import { analyzeSection as analyzeResumeSection, getSuggestions, actionVerbs } from "../services/resume.service.js";


const router = express.Router();

// Health check for AI service
router.get("/status", (req, res) => {
  res.json({
    available: isAIConfigured(),
    provider: isAIConfigured() ? 'openai' : null
  });
});

// Chat endpoint
router.post("/chat", async (req, res) => {
  console.log('[AI Route] POST /chat called');
  console.log('[AI Route] Body:', JSON.stringify(req.body).substring(0, 200));

  try {
    const { messages, resumeContext } = req.body;

    if (!messages || !Array.isArray(messages)) {
      console.error('[AI Route] Invalid messages:', messages);
      return res.status(400).json({ error: "Messages array required" });
    }

    if (!isAIConfigured()) {
      console.error('[AI Route] AI not configured');
      return res.status(503).json({
        error: "AI assistant is temporarily unavailable",
        message: "The AI service is not configured. Please contact support or try again later."
      });
    }

    console.log('[AI Route] Calling chat()...');
    const response = await chat(messages, resumeContext || {});
    console.log('[AI Route] chat() success, response length:', response?.length || 0);

    res.json({ message: response });
  } catch (err) {
    console.error('[AI Route] Error:', err.message);
    console.error('[AI Route] Stack:', err.stack);

    const status = err?.status === 429 ? 429 : (err?.statusCode || 500);

    // Return user-friendly error, not technical details
    const errorMessage = err.message?.includes('API key')
      ? "AI service configuration error"
      : err.message?.includes('rate limit') || err.message?.includes('Rate limit')
      ? "Rate limit exceeded. Please try again later."
      : err.message?.includes('unavailable')
      ? "AI service is temporarily unavailable"
      : "Unable to get AI response. Please try again.";

    // Ensure status mapping: don't leak internals, but also don't mislabel OpenAI config issues as 500.
    let mappedStatus = status;
    const msgLower = (err?.message || '').toLowerCase();
    const codeLower = (err?.code || '').toLowerCase();

    if (mappedStatus >= 500) {
      if (msgLower.includes('invalid openai') || msgLower.includes('api key') || codeLower.includes('invalid') || codeLower.includes('authentication')) {
        mappedStatus = 401;
      } else if (msgLower.includes('model') || msgLower.includes('not found') || msgLower.includes('permission') || msgLower.includes('access')) {
        mappedStatus = 503;
      }
    }

    res.status(mappedStatus).json({ error: errorMessage, message: err.message });
  }
});


// Streaming chat endpoint
router.post("/stream", async (req, res) => {
  try {
    const { messages, resumeContext } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages array required" });
    }

    if (!isAIConfigured()) {
      return res.status(503).json({
        error: "AI assistant is temporarily unavailable.",
        message: "Please configure OPENAI_API_KEY to enable AI features."
      });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    
    for await (const chunk of streamChat(messages, resumeContext || {})) {
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    }
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error("AI stream error:", err.message);
    res.status(500).json({ error: "AI service error" });
  }
});

// Improve content endpoint
router.post("/improve", async (req, res) => {
  try {
    const { content, section, context } = req.body;
    if (!content) {
      return res.status(400).json({ error: "Content required" });
    }
    const improved = await improveContent(content, section || "other", context || {});
    res.json({ improved, section });
  } catch (err) {
    console.error("AI improve error:", err.message);
    res.status(500).json({ error: "AI service error" });
  }
});

// ATS analysis endpoint
router.post("/ats", async (req, res) => {
  try {
    const { resumeData } = req.body;
    if (!resumeData) {
      return res.status(400).json({ error: "Resume data required" });
    }
    const analysis = await analyzeATS(resumeData);
    res.json(analysis);
  } catch (err) {
    console.error("ATS analysis error:", err.message);
    res.status(500).json({ error: "ATS analysis error" });
  }
});

// Generate summary endpoint
router.post("/summary", async (req, res) => {
  try {
    const { userProfile } = req.body;
    if (!userProfile) {
      return res.status(400).json({ error: "User profile required" });
    }
    const summary = await generateSummary(userProfile);
    res.json({ summary });
  } catch (err) {
    console.error("Summary generation error:", err.message);
    res.status(500).json({ error: "Summary generation error" });
  }
});

// Suggest metrics endpoint
router.post("/metrics", async (req, res) => {
  try {
    const { role, industry } = req.body;
    if (!role) {
      return res.status(400).json({ error: "Role required" });
    }
    const metrics = await suggestMetrics(role, industry || "technology");
    res.json({ metrics, role, industry });
  } catch (err) {
    console.error("Metrics suggestion error:", err.message);
    res.status(500).json({ error: "Metrics suggestion error" });
  }
});

// Resume section analysis
router.post("/analyze", async (req, res) => {
  try {
    const { section, data } = req.body;
    if (!section) {
      return res.status(400).json({ error: "Section required" });
    }
    const analysis = analyzeResumeSection(section, data);
    const suggestions = getSuggestions(section, data);
    res.json({ analysis, suggestions });
  } catch (err) {
    console.error("Analysis error:", err.message);
    res.status(500).json({ error: "Analysis error" });
  }
});

// Missing sections detection (disabled - implementation not present)
router.post("/missing", (req, res) => {
  res.status(501).json({
    error: "Not implemented",
    message: "Missing sections analysis is not available in this build.",
  });
});

// Get action verbs
router.get("/verbs", (req, res) => {
  res.json(actionVerbs);
});

export default router;
