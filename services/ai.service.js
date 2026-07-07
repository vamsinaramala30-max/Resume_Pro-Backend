


// AI Resume Assistant Service - OpenAI Integration
import OpenAI from 'openai';
import { getSystemPrompt } from './prompt.service.js';
import { analyzeSection as analyzeResumeSection, getSuggestions } from './resume.service.js';


let openai = null;

// Debug log the API key status on startup
console.log('[AI Service] Checking OPENAI_API_KEY...');
console.log('[AI Service] OPENAI_API_KEY exists:', !!process.env.OPENAI_API_KEY);
console.log('[AI Service] OPENAI_API_KEY prefix:', process.env.OPENAI_API_KEY?.substring(0, 15) || 'NOT FOUND');

// Check if AI is configured
export function isAIConfigured() {
  const configured = !!process.env.OPENAI_API_KEY;
  console.log('[AI Service] isAIConfigured:', configured);
  return configured;
}

function getClient() {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('[AI Service] No API key found!');
      // Return null instead of throwing - lets caller handle gracefully
      return null;
    }

    // Accept both legacy and project-style keys:
    // - sk-xxxxxxxx
    // - sk-proj-xxxxxxxx
    if (!apiKey.startsWith('sk-')) {
      console.error('[AI Service] Invalid API key format - expected to start with sk-');
      return null;
    }


    try {
      openai = new OpenAI({ apiKey });
      console.log('[AI Service] OpenAI client initialized');
    } catch (err) {
      console.error('[AI Service] Failed to initialize OpenAI:', err.message);
      return null;
    }
  }
  return openai;
}

// Chat completion with system prompt
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function chat(messages, resumeContext = {}) {
  console.log('[AI Service] chat() called with', messages?.length || 0, 'messages');

  const client = getClient();
  if (!client) {
    console.error('[AI Service] No client - API key missing or invalid');
    throw new Error('AI service is unavailable. Please configure OPENAI_API_KEY.');
  }

  const systemPrompt = getSystemPrompt(resumeContext);

  const chatMessages = [
    { role: 'system', content: systemPrompt },
    ...messages
  ];

  console.log('[AI Service] Calling OpenAI API...');

  const maxRetries = Number(process.env.OPENAI_RATE_LIMIT_RETRIES || 3);
  const baseDelayMs = Number(process.env.OPENAI_RATE_LIMIT_BASE_DELAY_MS || 750);

  let lastErr;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutMs = Number(process.env.OPENAI_REQUEST_TIMEOUT_MS || 30000);
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      // Try preferred model first; fallback for model/access issues
      const modelCandidates = [
        process.env.OPENAI_CHAT_MODEL || 'gpt-4o',
        'gpt-4o-mini'
      ].filter(Boolean);

      let response;
      let lastModelErr;

      for (const model of modelCandidates) {
        try {
          response = await client.chat.completions.create({
            model,
            messages: chatMessages,
            temperature: 0.7,
            max_tokens: 1000,
            signal: controller.signal,
          });
          break;
        } catch (modelErr) {
          lastModelErr = modelErr;
          const msg = modelErr?.message?.toLowerCase?.() || '';
          const status = modelErr?.status;
          const isModelProblem =
            msg.includes('model') ||
            msg.includes('not found') ||
            msg.includes('does not exist') ||
            msg.includes('permission') ||
            msg.includes('access') ||
            status === 404 ||
            status === 403;

          if (!isModelProblem) throw modelErr;
          // Otherwise try next model
        }
      }

      if (!response) {
        throw lastModelErr || new Error('No AI response');
      }


      clearTimeout(timeout);

      console.log('[AI Service] Response received');

      if (!response.choices || response.choices.length === 0) {
        console.error('[AI Service] No choices in response');
        throw new Error('Empty response from AI');
      }

      const content = response.choices[0]?.message?.content;
      if (!content) {
        console.error('[AI Service] No content in response choice');
        throw new Error('Empty response from AI');
      }

      return content;
    } catch (err) {
      lastErr = err;

      console.error('[AI Service] OpenAI API error:', {
        message: err?.message,
        name: err?.name,
        status: err?.status,
        code: err?.code,
      });

      if (err?.name === 'AbortError') {
        throw new Error('AI request timed out. Please try again.');
      }

      const isRateLimit = err?.message?.toLowerCase?.().includes('rate_limit') || err?.status === 429;

      if (isRateLimit) {
        // retry with backoff only for rate-limits
        if (attempt < maxRetries) {
          const exp = 2 ** attempt;
          const jitter = Math.floor(Math.random() * 250);
          const waitMs = baseDelayMs * exp + jitter;
          console.warn('[AI Service] Rate limited - retrying', { attempt: attempt + 1, maxRetries, waitMs });
          await sleep(waitMs);
          continue;
        }

        const rateErr = new Error('Rate limit exceeded. Please try again later.');
        rateErr.status = 429;
        throw rateErr;
      }

      if (err?.message?.toLowerCase?.().includes('invalid api key') || err?.message?.toLowerCase?.().includes('authentication')) {
        throw new Error('Invalid OpenAI API key. Please check OPENAI_API_KEY.');
      }

      throw new Error(err?.message || 'Unable to get AI response');
    }
  }

  // Should never reach due to throw in loop, but keep safe.
  throw new Error(lastErr?.message || 'Unable to get AI response');

}
// Streaming chat for real-time responses
export async function* streamChat(messages, resumeContext = {}) {
  const client = getClient();
  if (!client) {
    throw new Error('AI service is unavailable. Please configure OPENAI_API_KEY.');
  }

  const systemPrompt = getSystemPrompt(resumeContext);
  
  const chatMessages = [
    { role: 'system', content: systemPrompt },
    ...messages
  ];

  const stream = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: chatMessages,
    temperature: 0.7,
    max_tokens: 1000,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      yield content;
    }
  }
}

// Improve/rewrite resume content
export async function improveContent(content, section, context = {}) {
  const prompt = getImprovementPrompt(content, section, context);
  return chat([{ role: 'user', content: prompt }], context);
}

// ATS analysis
export async function analyzeATS(resumeData) {
  const prompt = `Analyze this resume for ATS optimization. Return a JSON object with:
- atsScore (0-100)
- keywords (array of found/missing keywords)
- suggestions (array of improvements)
- readabilityScore

Resume data: ${JSON.stringify(resumeData)}

Respond in JSON format only.`;

  
  const response = await chat([{ role: 'user', content: prompt }], {});
  
  try {
    return JSON.parse(response);
  } catch {
    return { atsScore: 70, keywords: [], suggestions: ['Unable to parse ATS analysis'], readabilityScore: 75 };
  }
}

// Generate summary
export async function generateSummary(userProfile) {
  const prompt = `Create a professional 2-4 sentence summary for a resume.

User profile: ${JSON.stringify(userProfile)}

Rules:
- Highlight experience, skills, and achievements
- Be concise and impactful
- Use recruiter-friendly language
- Include measurable outcomes if available`;

  return chat([{ role: 'user', content: prompt }], userProfile);
}

// Suggest achievement metrics
export async function suggestMetrics(role, industry) {
  const prompt = `Suggest 5-7 measurable achievement metrics for a ${role} in the ${industry} industry.

For each, provide:
- A strong action verb
- The metric/impact
- Context that makes it quantifiable`;

  return chat([{ role: 'user', content: prompt }], { role, industry });
}

// Get improvement prompt based on section
function getImprovementPrompt(content, section, context) {
  const sectionGuides = {
    summary: 'Transform this into a compelling professional summary. Focus on achievements and value proposition.',
    experience: 'Rewrite these bullet points to be achievement-based with metrics. Use strong action verbs.',
    skills: 'Organize these skills into categories: Technical, Soft Skills, Tools, Languages.',
    projects: 'Use STAR method (Situation, Task, Action, Result) to describe this project.',
    education: 'Highlight relevant coursework, achievements, and leadership activities.',
    other: 'Improve this content for a professional resume.'
  };

  return `${sectionGuides[section] || sectionGuides.other}

Current content: ${content}

Respond with improved version and brief explanation of changes.`;
}

export default {
  chat,
  streamChat,
  improveContent,
  analyzeATS,
  generateSummary,
  suggestMetrics,
  getClient
};
