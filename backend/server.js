/**
 * DeadlineBuddy — Express Server
 * Bootstraps: env validation → DB → reminder engine → routes → IMAP
 */

// ── Env & logging first ───────────────────────────────────────────
require("dotenv").config();

const validateEnv = require("./utils/validateEnv");
validateEnv(); // Exits process immediately if required vars are missing

const { createLogger } = require("./utils/logger");
const logger = createLogger("Server");

// ── Core dependencies ─────────────────────────────────────────────
const express        = require("express");
const cors           = require("cors");
const connectDB      = require("./config/db");
const startReminderEngine = require("./services/reminderService");
const authMiddleware = require("./middleware/authMiddleware");

// ── Routes ────────────────────────────────────────────────────────
const authRoutes     = require("./routes/authRoutes");
const taskRoutes     = require("./routes/taskRoutes");
const reminderRoutes = require("./routes/reminderRoutes");
const healthRoutes   = require("./routes/healthRoutes");

// ── App setup ─────────────────────────────────────────────────────
const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Global request logger ─────────────────────────────────────────
app.use((req, _res, next) => {
    logger.debug("Incoming request", { method: req.method, path: req.path });
    next();
});

// ── Routes ────────────────────────────────────────────────────────
app.use("/health",           healthRoutes);
app.use("/api/auth",         authRoutes);
app.use("/api/tasks",        taskRoutes);
app.use("/api/reminders",    reminderRoutes);

app.get("/", (_req, res) => {
    res.json({ message: "DeadlineBuddy API Running 🚀" });
});

// Protected test route
app.get("/api/protected", authMiddleware, (req, res) => {
    res.json({ message: "Protected route accessed", user: req.user });
});

// ── 404 handler ───────────────────────────────────────────────────
app.use((req, res) => {
    logger.warn("404 Not Found", { method: req.method, path: req.path });
    res.status(404).json({ message: "Route not found" });
});

// ── Global error handler ──────────────────────────────────────────
app.use((err, req, res, _next) => {
    logger.error("Unhandled express error", {
        method: req.method,
        path:   req.path,
        error:  err.message,
        stack:  err.stack
    });
    res.status(err.status || 500).json({
        message: err.message || "Internal server error"
    });
});

// ── Boot sequence ─────────────────────────────────────────────────
async function boot() {
    try {
        await connectDB();
        logger.info("Database connected");

        startReminderEngine();

        // IMAP — optional, crash-safe
        if (
            process.env.EMAIL_USER &&
            process.env.EMAIL_PASS &&
            process.env.EMAIL_HOST &&
            process.env.EMAIL_PORT
        ) {
            try {
                const imap = require("./services/emailReader");
                imap.connect();
                logger.info("IMAP connecting…");
            } catch (err) {
                logger.warn("IMAP failed to start (server still running)", { error: err.message });
            }
        } else {
            logger.warn("IMAP skipped — EMAIL_HOST / EMAIL_PORT not set");
        }

        const PORT = process.env.PORT || 5000;
        app.listen(PORT, () => {
            logger.info(`Server running on port ${PORT} ✓`);
        });

    } catch (err) {
        logger.error("Boot failed", { error: err.message });
        process.exit(1);
    }
}

boot();