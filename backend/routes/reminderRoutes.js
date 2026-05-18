/**
 * Reminder Routes
 * GET  /api/reminders/unsubscribe   — one-click unsubscribe (link in email)
 * POST /api/reminders/snooze        — snooze a task reminder
 * POST /api/reminders/digest        — toggle digest mode for a task
 */

const express       = require("express");
const router        = express.Router();
const Task          = require("../models/Task");
const User          = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const { validate, schemas } = require("../middleware/validationMiddleware");
const { createLogger }      = require("../utils/logger");

const logger = createLogger("ReminderRoutes");

// ── Allowed snooze durations (minutes) ───────────────────────────
const VALID_SNOOZE_MINS = [15, 30, 60, 120, 1440];

// ─────────────────────────────────────────────────────────────────
// GET /api/reminders/unsubscribe?email=...&token=...
// One-click unsubscribe — no auth required (linked from email)
// ─────────────────────────────────────────────────────────────────
router.get("/unsubscribe", async (req, res) => {
    const { email, token } = req.query;

    if (!email || !token) {
        return res.status(400).send("<h2>Invalid unsubscribe link.</h2>");
    }

    try {
        // 1. Disable on all tasks owned by this email
        const taskResult = await Task.updateMany(
            { userEmail: email.toLowerCase(), unsubscribeToken: token },
            { $set: { remindersDisabled: true, unsubscribedAt: new Date() } }
        );

        // 2. Disable globally on the User record (if exists)
        const user = await User.findOneAndUpdate(
            { email: email.toLowerCase(), unsubscribeToken: token },
            { $set: { remindersDisabled: true, unsubscribedAt: new Date() } }
        );

        if (taskResult.modifiedCount === 0 && !user) {
            logger.warn("Unsubscribe attempt with invalid token", { email });
            return res.status(400).send(`
                <h2>Invalid or expired unsubscribe link.</h2>
                <p>Please contact support if you need help.</p>
            `);
        }

        logger.info("User unsubscribed from reminders", { email });
        return res.send(`
            <html>
            <body style="font-family:Arial,sans-serif;text-align:center;padding:60px;">
                <h1>✅ Unsubscribed</h1>
                <p>You've been successfully unsubscribed from DeadlineBuddy reminders.</p>
                <p style="color:#888;font-size:14px;">You can re-enable reminders from your dashboard settings.</p>
            </body>
            </html>
        `);

    } catch (err) {
        logger.error("Unsubscribe error", { error: err.message });
        return res.status(500).send("<h2>Something went wrong. Please try again.</h2>");
    }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/reminders/snooze?taskId=...&mins=...
// One-click snooze — no auth (linked from email)
// ─────────────────────────────────────────────────────────────────
router.get("/snooze", async (req, res) => {
    const { taskId, mins } = req.query;
    const snoozeMins = parseInt(mins, 10);

    if (!taskId || isNaN(snoozeMins) || !VALID_SNOOZE_MINS.includes(snoozeMins)) {
        return res.status(400).send("<h2>Invalid snooze request.</h2>");
    }

    try {
        const task = await Task.findById(taskId);
        if (!task) {
            return res.status(404).send("<h2>Task not found.</h2>");
        }

        const until = new Date(Date.now() + snoozeMins * 60 * 1000);
        task.snoozedUntil = until;
        task.snoozeCount  = (task.snoozeCount || 0) + 1;
        await task.save();

        logger.info("Task snoozed via email link", {
            taskId: String(task._id),
            mins:   snoozeMins,
            until:  until.toISOString()
        });

        const label = snoozeMins >= 1440
            ? "1 day"
            : snoozeMins >= 60
                ? `${snoozeMins / 60} hour(s)`
                : `${snoozeMins} minute(s)`;

        return res.send(`
            <html>
            <body style="font-family:Arial,sans-serif;text-align:center;padding:60px;">
                <h1>⏱ Reminder Snoozed</h1>
                <p>Your reminder for <strong>${task.title}</strong> has been snoozed for <strong>${label}</strong>.</p>
                <p style="color:#888;font-size:14px;">You will be reminded again after ${until.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}.</p>
            </body>
            </html>
        `);

    } catch (err) {
        logger.error("Snooze via link error", { error: err.message });
        return res.status(500).send("<h2>Something went wrong.</h2>");
    }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/reminders/snooze   (authenticated API)
// Body: { taskId, snoozeMins }
// ─────────────────────────────────────────────────────────────────
router.post("/snooze", authMiddleware, async (req, res) => {
    const { taskId, snoozeMins } = req.body;
    const mins = parseInt(snoozeMins, 10);

    if (!taskId) {
        return res.status(400).json({ message: "'taskId' is required" });
    }
    if (isNaN(mins) || !VALID_SNOOZE_MINS.includes(mins)) {
        return res.status(400).json({
            message: `'snoozeMins' must be one of: ${VALID_SNOOZE_MINS.join(", ")}`
        });
    }

    try {
        const task = await Task.findOne({ _id: taskId, user: req.user.id });
        if (!task) {
            return res.status(404).json({ message: "Task not found or unauthorized" });
        }

        const until = new Date(Date.now() + mins * 60 * 1000);
        task.snoozedUntil = until;
        task.snoozeCount  = (task.snoozeCount || 0) + 1;
        await task.save();

        logger.info("Task snoozed via API", { taskId, userId: req.user.id, mins });
        return res.status(200).json({
            message:      "Reminder snoozed",
            snoozedUntil: until
        });

    } catch (err) {
        logger.error("Snooze API error", { error: err.message });
        return res.status(500).json({ message: "Internal server error" });
    }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/reminders/digest   (authenticated API)
// Body: { taskId, enabled }  — toggle digest mode for one task
// ─────────────────────────────────────────────────────────────────
router.post("/digest", authMiddleware, async (req, res) => {
    const { taskId, enabled } = req.body;

    if (!taskId) {
        return res.status(400).json({ message: "'taskId' is required" });
    }

    try {
        const task = await Task.findOne({ _id: taskId, user: req.user.id });
        if (!task) {
            return res.status(404).json({ message: "Task not found or unauthorized" });
        }

        task.digestMode = !!enabled;
        await task.save();

        logger.info("Digest mode toggled", { taskId, enabled: task.digestMode, userId: req.user.id });
        return res.status(200).json({
            message:    `Digest mode ${task.digestMode ? "enabled" : "disabled"}`,
            digestMode: task.digestMode
        });

    } catch (err) {
        logger.error("Digest toggle error", { error: err.message });
        return res.status(500).json({ message: "Internal server error" });
    }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/reminders/resubscribe  (authenticated API)
// Re-enable reminders for all tasks of this user
// ─────────────────────────────────────────────────────────────────
router.post("/resubscribe", authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: "User not found" });

        user.remindersDisabled = false;
        user.unsubscribedAt    = null;
        await user.save();

        // Also re-enable on all their tasks
        await Task.updateMany(
            { user: req.user.id },
            { $set: { remindersDisabled: false } }
        );

        logger.info("User resubscribed", { userId: req.user.id });
        return res.status(200).json({ message: "Reminders re-enabled" });

    } catch (err) {
        logger.error("Resubscribe error", { error: err.message });
        return res.status(500).json({ message: "Internal server error" });
    }
});

module.exports = router;