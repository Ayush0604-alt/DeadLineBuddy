/**
 * AI Service (Gemini)
 * Features:
 *  - Exponential backoff retry (up to 4 attempts)
 *  - Rate-limit (429) detection and handling
 *  - Structured JSON response parsing
 *  - Graceful fallback on total failure
 */

const { GoogleGenAI } = require("@google/genai");
const { createLogger } = require("../utils/logger");

const logger = createLogger("AIService");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ── Retry config ──────────────────────────────────────────────────
const MAX_RETRIES       = 4;
const BASE_DELAY_MS     = 1000;  // 1 s
const MAX_DELAY_MS      = 30000; // 30 s cap

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isRateLimitError(err) {
    return (
        err?.status === 429 ||
        err?.message?.includes("429") ||
        err?.message?.toLowerCase().includes("quota") ||
        err?.message?.toLowerCase().includes("rate limit")
    );
}

function isRetryableError(err) {
    const msg = (err?.message || "").toLowerCase();
    return (
        isRateLimitError(err) ||
        err?.status === 500 ||
        err?.status === 503 ||
        msg.includes("timeout") ||
        msg.includes("network") ||
        msg.includes("econnreset") ||
        msg.includes("enotfound")
    );
}

async function callGeminiWithRetry(prompt, attempt = 1) {
    try {
        logger.debug("Calling Gemini API", { attempt });

        const response = await ai.models.generateContent({
            model:    "gemini-2.5-flash",
            contents: prompt
        });

        return response.text;

    } catch (err) {
        if (attempt >= MAX_RETRIES) {
            logger.error("Gemini API failed after all retries", {
                attempt,
                error: err.message
            });
            throw err;
        }

        if (!isRetryableError(err)) {
            logger.error("Gemini API non-retryable error", { error: err.message });
            throw err;
        }

        // Exponential backoff, longer for rate-limit errors
        const multiplier  = isRateLimitError(err) ? 4 : 2;
        const jitter      = Math.random() * 500;
        const delay       = Math.min(BASE_DELAY_MS * Math.pow(multiplier, attempt - 1) + jitter, MAX_DELAY_MS);

        logger.warn("Gemini API retryable error — will retry", {
            attempt,
            nextAttempt: attempt + 1,
            delayMs:     Math.round(delay),
            error:       err.message,
            isRateLimit: isRateLimitError(err)
        });

        await sleep(delay);
        return callGeminiWithRetry(prompt, attempt + 1);
    }
}

// ── Fallback result when AI completely fails ──────────────────────
function fallbackResult(text) {
    return {
        summary:              text ? text.substring(0, 300) : "Could not extract summary",
        deadline:             "Not specified",
        priority:             "Low",
        category:             "General",
        reason:               "",
        actionItems:          [],
        skillsDetected:       [],
        companyOrOrganization:"",
        importantLinks:       [],
        isOpportunityRelevant: false,
        _fallback:            true
    };
}

// ── Clean raw AI text and parse JSON ─────────────────────────────
function parseAIResponse(raw) {
    const cleaned = raw
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

    // Extract the first JSON object in the response
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON object found in AI response");

    return JSON.parse(match[0]);
}

// ── System prompt ─────────────────────────────────────────────────
const SYSTEM_PROMPT = `
You are an intelligent AI assistant for DeadlineBuddy.
Analyze the provided content carefully.
Return ONLY valid raw JSON — no markdown, no code blocks, no explanations.

STRICT JSON FORMAT:
{
  "summary": "concise 2-3 sentence summary",
  "deadline": "ISO datetime in IST e.g. 2026-05-18T16:30:00+05:30 or 'Not specified'",
  "priority": "High | Medium | Low",
  "category": "Internship | Job Opportunity | Assignment | Exam | Event | Meeting | Resume | General",
  "reason": "why this matters",
  "actionItems": ["max 5 short bullets"],
  "skillsDetected": [],
  "companyOrOrganization": "",
  "importantLinks": [],
  "isOpportunityRelevant": true
}
`;

// ── Public API ────────────────────────────────────────────────────
async function analyzeDocument(text) {
    if (!text || text.trim().length === 0) {
        logger.warn("analyzeDocument called with empty text");
        return fallbackResult(text);
    }

    const prompt = `${SYSTEM_PROMPT}\n\nCONTENT:\n${text.substring(0, 12000)}`;

    try {
        const raw    = await callGeminiWithRetry(prompt);
        const parsed = parseAIResponse(raw);
        logger.info("AI document analysis successful");
        return parsed;
    } catch (err) {
        logger.error("AI analysis failed — using fallback", { error: err.message });
        return fallbackResult(text);
    }
}

module.exports = { analyzeDocument };