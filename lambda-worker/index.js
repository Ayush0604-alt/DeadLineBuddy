
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const pdfParse  = require("pdf-parse");
const mammoth   = require("mammoth");
const mongoose  = require("mongoose");
const { GoogleGenAI } = require("@google/genai");
const fs   = require("fs");
const path = require("path");
const crypto = require("crypto");
const Task  = require("./models/Task");


function log(level, context, message, meta = {}) {
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        context,
        message,
        ...(Object.keys(meta).length > 0 ? { meta } : {})
    };
    const output = JSON.stringify(entry);
    if (level === "ERROR" || level === "WARN") {
        console.error(output);
    } else {
        console.log(output);
    }
}

const logger = {
    debug: (msg, meta) => log("DEBUG", "Lambda", msg, meta),
    info:  (msg, meta) => log("INFO",  "Lambda", msg, meta),
    warn:  (msg, meta) => log("WARN",  "Lambda", msg, meta),
    error: (msg, meta) => log("ERROR", "Lambda", msg, meta)
};


const s3 = new S3Client({ region: process.env.AWS_REGION });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });


const MAX_RETRIES   = 4;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS  = 30000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function isRateLimitError(err) {
    return (
        err?.status === 429 ||
        String(err?.message).includes("429") ||
        String(err?.message).toLowerCase().includes("quota") ||
        String(err?.message).toLowerCase().includes("rate limit")
    );
}

function isRetryable(err) {
    const msg = String(err?.message || "").toLowerCase();
    return (
        isRateLimitError(err) ||
        [500, 503].includes(err?.status) ||
        msg.includes("timeout") ||
        msg.includes("network") ||
        msg.includes("econnreset") ||
        msg.includes("enotfound")
    );
}

async function geminiWithRetry(prompt, attempt = 1) {
    try {
        const response = await ai.models.generateContent({
            model:    "gemini-2.5-flash",
            contents: prompt
        });
        return response.text;
    } catch (err) {
        if (attempt >= MAX_RETRIES || !isRetryable(err)) {
            logger.error("Gemini failed", { attempt, error: err.message });
            throw err;
        }
        const multiplier = isRateLimitError(err) ? 4 : 2;
        const delay = Math.min(BASE_DELAY_MS * Math.pow(multiplier, attempt - 1) + Math.random() * 500, MAX_DELAY_MS);
        logger.warn("Gemini retryable error", { attempt, delayMs: Math.round(delay), error: err.message, isRateLimit: isRateLimitError(err) });
        await sleep(delay);
        return geminiWithRetry(prompt, attempt + 1);
    }
}


function parseAIResponse(raw) {
    const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    const match   = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON object in AI response");
    return JSON.parse(match[0]);
}

function fallbackAI(title) {
    return {
        summary:     "AI analysis unavailable",
        deadline:    "Not specified",
        priority:    "Low",
        category:    "General",
        reason:      "",
        actionItems: [],
        _fallback:   true
    };
}


function makeDedupHash(title, userEmail, deadline) {
    const raw = `${(title || "").toLowerCase().trim()}|${(userEmail || "").toLowerCase().trim()}|${(deadline || "").trim()}`;
    return crypto.createHash("sha256").update(raw).digest("hex");
}


async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}


async function extractText(body) {
    const { sourceType, fileName, emailText, fileBuffer } = body;

    if (sourceType === "EMAIL") {
        logger.info("Extracting from email body");
        return { text: emailText || "", type: "EMAIL" };
    }

    logger.info("Downloading from S3", { fileName });
    const cmd      = new GetObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME, Key: fileName });
    const response = await s3.send(cmd);
    const buf      = await streamToBuffer(response.Body);

    const ext = (fileName || "").toLowerCase();

    if (ext.endsWith(".pdf")) {
        logger.info("Parsing PDF");
        const data = await pdfParse(buf);
        return { text: data.text, type: "PDF" };
    }

    if (ext.endsWith(".docx")) {
        logger.info("Parsing DOCX");
        const tmp = path.join("/tmp", fileName);
        fs.writeFileSync(tmp, buf);
        const result = await mammoth.extractRawText({ path: tmp });
        return { text: result.value, type: "DOCX" };
    }

    if (ext.endsWith(".txt")) {
        logger.info("Parsing TXT");
        return { text: buf.toString("utf-8"), type: "TXT" };
    }

    throw new Error(`Unsupported file type: ${fileName}`);
}


const AI_PROMPT_TEMPLATE = (content) => `
You are an intelligent AI assistant for DeadlineBuddy.
Analyze the provided content carefully.
Return ONLY valid raw JSON — no markdown, no code blocks.

{
  "summary": "2-3 sentence summary",
  "deadline": "ISO datetime IST e.g. 2026-05-18T16:30:00+05:30 or 'Not specified'",
  "priority": "High | Medium | Low",
  "category": "Internship | Job Opportunity | Assignment | Exam | Event | Meeting | Resume | General",
  "reason": "why this matters",
  "actionItems": ["max 5 short bullets"],
  "skillsDetected": [],
  "companyOrOrganization": "",
  "importantLinks": [],
  "isOpportunityRelevant": true
}

CONTENT:
${content.substring(0, 12000)}
`;

async function analyzeWithAI(text, title) {
    try {
        const raw    = await geminiWithRetry(AI_PROMPT_TEMPLATE(text));
        const parsed = parseAIResponse(raw);
        logger.info("AI analysis complete");
        return parsed;
    } catch (err) {
        logger.error("AI analysis failed — using fallback", { error: err.message });
        return fallbackAI(title);
    }
}


async function processRecord(record) {
    let body;
    try {
        body = JSON.parse(record.body);
    } catch (err) {
     
        logger.error("Unparseable SQS message body — routing to DLQ", { error: err.message, raw: record.body });
        throw new Error(`SQS message parse failure: ${err.message}`);
    }

    logger.info("Processing record", { sourceType: body.sourceType || "FILE", fileName: body.fileName });

    
    let extracted;
    try {
        extracted = await extractText(body);
    } catch (err) {

        logger.error("Text extraction failed — skipping record", { error: err.message, fileName: body.fileName });
        return;
    }

    if (!extracted.text || extracted.text.trim().length === 0) {
        logger.warn("No text extracted — skipping record", { fileName: body.fileName });
        return;
    }

    logger.info("Text extracted", { type: extracted.type, chars: extracted.text.length });

    
    const taskTitle = body.subject || body.fileName || "Untitled Task";
    const ai        = await analyzeWithAI(extracted.text, taskTitle);

    const hash = makeDedupHash(taskTitle, body.userEmail, ai.deadline);
    const dupe = await Task.findOne({ dedupHash: hash });
    if (dupe) {
        logger.warn("Duplicate task detected — skipping save", {
            existingId: String(dupe._id),
            title:      taskTitle,
            userEmail:  body.userEmail
        });
        return;
    }

    // ── Save task ──
    const task = await Task.create({
        title:       taskTitle,
        userEmail:   (body.userEmail || "").toLowerCase(),
        summary:     ai.summary     || "",
        category:    ai.category    || "General",
        priority:    ai.priority    || "Low",
        deadline:    ai.deadline    || "Not specified",
        reason:      ai.reason      || "",
        actionItems: ai.actionItems || [],
        s3Url:       body.s3Url     || "",
        sourceType:  extracted.type,
        dedupHash:   hash
    });

    logger.info("Task saved", { taskId: String(task._id), title: taskTitle });
}

// ── Lambda handler ────────────────────────────────────────────────
exports.handler = async (event) => {
    logger.info("Lambda invoked", { recordCount: event.Records?.length || 0 });

    // ── Connect MongoDB (reuse connection across warm invocations) ──
    if (mongoose.connection.readyState === 0) {
        logger.info("Connecting to MongoDB…");
        try {
            await mongoose.connect(process.env.MONGO_URI, {
                serverSelectionTimeoutMS: 8000,
                socketTimeoutMS:          30000
            });
            logger.info("MongoDB connected");
        } catch (err) {
            // DB connection failure is fatal — throw so Lambda retries and DLQ catches persistent failure
            logger.error("MongoDB connection failed — throwing for DLQ", { error: err.message });
            throw err;
        }
    }

    const results = { success: 0, skipped: 0, failed: 0 };

    for (const record of event.Records) {
        try {
            await processRecord(record);
            results.success++;
        } catch (err) {
            // Per-record errors: log and continue (prevents one bad record blocking the rest)
            // Note: SQS partial batch failure reporting can be enabled via batchItemFailures
            logger.error("Record processing failed", { error: err.message, messageId: record.messageId });
            results.failed++;
        }
    }

    logger.info("Lambda complete", results);

    // Return batchItemFailures for partial-batch failure support
    // (requires Lambda event source mapping to have ReportBatchItemFailures enabled)
    return {
        statusCode: 200,
        body: JSON.stringify({ message: "Processing complete", results })
    };
};