/**
 * Reminder Service
 * Features:
 *  - Multi-window reminders (7d / 1d / 1h / 10m)
 *  - Snooze support
 *  - Unsubscribe (per-task and global)
 *  - Duplicate reminder protection (per window, per task)
 *  - Daily digest mode
 *  - Priority escalation logic
 *  - Structured logging
 */

const cron      = require("node-cron");
const crypto    = require("crypto");
const Task      = require("../models/Task");
const User      = require("../models/User");
const { sendReminderEmail, sendDigestEmail, generateUnsubscribeToken } = require("./emailService");
const { createLogger } = require("../utils/logger");

const logger = createLogger("ReminderService");

// ── Time windows (ms) ─────────────────────────────────────────────
const WINDOWS = {
    sevenDay:  7 * 24 * 60 * 60 * 1000,
    oneDay:    24 * 60 * 60 * 1000,
    oneHour:   60 * 60 * 1000,
    tenMinute: 10 * 60 * 1000
};

// ── Escalation rules ──────────────────────────────────────────────
// If a Low/Medium task is now within these thresholds, bump priority.
const ESCALATION_THRESHOLDS = {
    Low:    { bumpTo: "Medium", withinMs: WINDOWS.oneDay },
    Medium: { bumpTo: "High",   withinMs: WINDOWS.oneHour }
};

// ── Digest accumulator (keyed by email) ───────────────────────────
// Accumulates tasks during each cron tick; flushed at 08:00 daily.
const digestAccumulator = new Map(); // email → Set<taskId>

// ── Helpers ───────────────────────────────────────────────────────
function getReminderWindow(diff) {
    if (diff < WINDOWS.tenMinute)                                  return "tenMinute";
    if (diff < WINDOWS.oneHour   && diff >= WINDOWS.tenMinute)    return "oneHour";
    if (diff < WINDOWS.oneDay    && diff >= WINDOWS.oneHour)      return "oneDay";
    if (diff < WINDOWS.sevenDay  && diff >= WINDOWS.oneDay)       return "sevenDay";
    return null;
}

function windowLabel(window) {
    return {
        sevenDay:  "7-Day Reminder",
        oneDay:    "1-Day Reminder",
        oneHour:   "1-Hour Reminder",
        tenMinute: "Final Reminder (10 min)"
    }[window] || "Reminder";
}

async function ensureUnsubscribeToken(task) {
    if (!task.unsubscribeToken) {
        task.unsubscribeToken = generateUnsubscribeToken();
        await task.save();
    }
    return task.unsubscribeToken;
}

// ── Escalation ────────────────────────────────────────────────────
async function maybeEscalatePriority(task, diff) {
    if (task.escalated) return; // already escalated — don't touch again

    const rule = ESCALATION_THRESHOLDS[task.priority];
    if (!rule) return;

    if (diff <= rule.withinMs) {
        task.originalPriority = task.priority;
        task.priority         = rule.bumpTo;
        task.escalated        = true;
        await task.save();
        logger.info("Task priority escalated", {
            taskId: String(task._id),
            from:   task.originalPriority,
            to:     task.priority
        });
    }
}

// ── Process a single task ─────────────────────────────────────────
/**
 * Drop-in replacement for the processTask() function in
 * backend/services/reminderService.js
 *
 * Key fixes:
 * 1. Guard against task.user === null before calling User.findById()
 * 2. Validate that the deadline is actually in the future (handles AI returning past dates)
 * 3. Cleaner log messages to make CloudWatch debugging easier
 */

async function processTask(task, now) {
    try {
        // ── 1. Validate deadline ──────────────────────────────────
        if (!task.deadline || task.deadline === "Not specified") {
            logger.debug("Skipping — no deadline", { taskId: String(task._id) });
            return;
        }

        const deadline = new Date(task.deadline);
        if (isNaN(deadline.getTime())) {
            logger.warn("Skipping — unparseable deadline", {
                taskId:   String(task._id),
                deadline: task.deadline
            });
            return;
        }

        const diff = deadline - now;
        if (diff <= 0) {
            logger.debug("Skipping — deadline already passed", {
                taskId:   String(task._id),
                deadline: task.deadline
            });
            return;
        }

        // ── 2. Reminders disabled on this task ────────────────────
        if (task.remindersDisabled) {
            logger.debug("Skipping — reminders disabled on task", { taskId: String(task._id) });
            return;
        }

        // ── 3. Snooze guard ───────────────────────────────────────
        if (task.snoozedUntil && now < new Date(task.snoozedUntil)) {
            logger.debug("Skipping — snoozed", {
                taskId:       String(task._id),
                snoozedUntil: task.snoozedUntil
            });
            return;
        }

        // ── 4. Resolve recipient email ────────────────────────────
        // Lambda tasks: userEmail set, user = null
        // Dashboard tasks: user set, userEmail may be empty
        let recipientEmail = (task.userEmail || "").trim();
        let user = null;

        if (!recipientEmail && task.user) {
            user = await User.findById(task.user).lean();
            recipientEmail = user?.email || "";
        }

        if (!recipientEmail) {
            logger.warn("Skipping — no recipient email resolved", { taskId: String(task._id) });
            return;
        }

        // ── 5. Global unsubscribe check ───────────────────────────
        // Only look up user if we haven't already AND task.user is not null
        if (!user && task.user) {
            user = await User.findById(task.user).lean();
        }
        // For Lambda tasks (user = null), skip the global unsubscribe check —
        // the per-task remindersDisabled flag was already checked above.
        if (user?.remindersDisabled) {
            logger.debug("Skipping — user globally unsubscribed", { email: recipientEmail });
            return;
        }

        // ── 6. Priority escalation ────────────────────────────────
        await maybeEscalatePriority(task, diff);

        // ── 7. Which reminder window are we in? ───────────────────
        const window = getReminderWindow(diff);
        if (!window) {
            logger.debug("Skipping — outside all reminder windows", {
                taskId:  String(task._id),
                diffHrs: Math.round(diff / 36e5)
            });
            return;
        }

        // ── 8. Duplicate protection (already sent for this window) ─
        if (task.remindersSent?.[window]) {
            logger.debug("Skipping — already sent for this window", {
                taskId: String(task._id), window
            });
            return;
        }

        // ── 9. Digest mode ────────────────────────────────────────
        const useDigest = task.digestMode || user?.digestModeDefault || false;
        if (useDigest) {
            if (!digestAccumulator.has(recipientEmail)) {
                digestAccumulator.set(recipientEmail, new Set());
            }
            digestAccumulator.get(recipientEmail).add(String(task._id));

            task.remindersSent = { ...(task.remindersSent || {}), [window]: true };
            await task.save();

            logger.info("Task queued for digest", {
                taskId: String(task._id), email: recipientEmail, window
            });
            return;
        }

        // ── 10. Send individual reminder ──────────────────────────
        const token = await ensureUnsubscribeToken(task);

        logger.info("Sending reminder", {
            taskId:    String(task._id),
            email:     recipientEmail,
            window,
            deadline:  task.deadline,
            diffHours: Math.round(diff / 36e5)
        });

        const sent = await sendReminderEmail(recipientEmail, task, windowLabel(window), token);

        if (sent) {
            task.remindersSent = { ...(task.remindersSent || {}), [window]: true };
            await task.save();
            logger.info("Reminder sent ✓", {
                taskId: String(task._id),
                email:  recipientEmail,
                window
            });
        } else {
            logger.error("sendReminderEmail returned false — check EMAIL_USER / EMAIL_PASS", {
                taskId: String(task._id),
                email:  recipientEmail
            });
        }

    } catch (err) {
        logger.error("processTask error", { taskId: String(task._id), error: err.message });
    }
}

// ── Flush digest accumulator ──────────────────────────────────────
async function flushDigests() {
    if (digestAccumulator.size === 0) return;

    logger.info("Flushing digest emails", { emailCount: digestAccumulator.size });

    for (const [email, taskIdSet] of digestAccumulator.entries()) {
        try {
            const ids   = Array.from(taskIdSet);
            const tasks = await Task.find({ _id: { $in: ids } }).lean();

            // Build a per-user unsubscribe token from first task
            const token = tasks[0]?.unsubscribeToken || "";

            await sendDigestEmail(email, tasks, token);
            logger.info("Digest sent", { to: email, count: tasks.length });
        } catch (err) {
            logger.error("Digest flush error", { email, error: err.message });
        }
    }

    digestAccumulator.clear();
}

// ── Main reminder cron (every minute) ────────────────────────────
function startReminderEngine() {
    logger.info("Reminder engine starting…");

    cron.schedule("* * * * *", async () => {
        const now = new Date();
        logger.debug("Reminder cron tick", { time: now.toISOString() });

        try {
            // Only fetch tasks with valid, future deadlines
            const tasks = await Task.find({
                deadline:          { $ne: "Not specified" },
                remindersDisabled: { $ne: true }
            });

            logger.debug("Tasks fetched for reminder check", { count: tasks.length });

            for (const task of tasks) {
                await processTask(task, now);
            }

        } catch (err) {
            logger.error("Reminder engine cron error", { error: err.message });
        }
    });

    // Daily digest flush at 08:00 every morning
    cron.schedule("0 8 * * *", async () => {
        logger.info("Running daily digest flush");
        await flushDigests();
    });

    logger.info("Reminder engine started ✓  (individual: every min | digest flush: 08:00 daily)");
}

module.exports = startReminderEngine;