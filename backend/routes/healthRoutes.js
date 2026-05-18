/**
 * Health Check Route
 * GET /health
 * Returns system status: API, database, memory, uptime.
 * Safe to expose publicly — no sensitive data included.
 */

const express  = require("express");
const router   = express.Router();
const mongoose = require("mongoose");
const { createLogger } = require("../utils/logger");

const logger    = createLogger("HealthCheck");
const startTime = Date.now();

router.get("/", async (req, res) => {
    const now = Date.now();

    // ── Database ping ─────────────────────────────────────────────
    let dbStatus  = "disconnected";
    let dbLatency = null;

    try {
        const dbStart = Date.now();
        await mongoose.connection.db.admin().ping();
        dbLatency = Date.now() - dbStart;
        dbStatus  = "connected";
    } catch (err) {
        logger.warn("Health check — DB ping failed", { error: err.message });
        dbStatus = "error";
    }

    // ── Memory ────────────────────────────────────────────────────
    const mem = process.memoryUsage();

    const status = dbStatus === "connected" ? "ok" : "degraded";
    const httpStatus = status === "ok" ? 200 : 503;

    const body = {
        status,
        timestamp:      new Date().toISOString(),
        uptimeSeconds:  Math.floor((now - startTime) / 1000),
        version:        process.env.npm_package_version || "unknown",
        environment:    process.env.NODE_ENV || "development",
        database: {
            status:     dbStatus,
            latencyMs:  dbLatency
        },
        memory: {
            rss:         `${Math.round(mem.rss / 1024 / 1024)} MB`,
            heapUsed:    `${Math.round(mem.heapUsed / 1024 / 1024)} MB`,
            heapTotal:   `${Math.round(mem.heapTotal / 1024 / 1024)} MB`
        },
        services: {
            reminderEngine: "running",
            emailService:   process.env.EMAIL_USER ? "configured" : "not configured",
            s3:             process.env.AWS_BUCKET_NAME ? "configured" : "not configured",
            sqs:            process.env.AWS_SQS_URL ? "configured" : "not configured",
            gemini:         process.env.GEMINI_API_KEY ? "configured" : "not configured",
            imap:           (process.env.EMAIL_HOST && process.env.EMAIL_PORT) ? "configured" : "not configured"
        }
    };

    logger.debug("Health check performed", { status });
    return res.status(httpStatus).json(body);
});

module.exports = router;