/**
 * Email Service
 * Handles transactional reminder emails, digest emails, and unsubscribe links.
 */

const nodemailer  = require("nodemailer");
const crypto      = require("crypto");
const { createLogger } = require("../utils/logger");

const logger = createLogger("EmailService");

// ── Transporter (singleton) ───────────────────────────────────────
let _transporter = null;

function getTransporter() {
    if (!_transporter) {
        _transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });
    }
    return _transporter;
}

// ── Helpers ───────────────────────────────────────────────────────
function generateUnsubscribeToken() {
    return crypto.randomBytes(32).toString("hex");
}

function buildUnsubscribeUrl(email, token) {
    const base = process.env.APP_BASE_URL || "http://localhost:5000";
    return `${base}/api/reminders/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
}

function buildSnoozeUrl(taskId, snoozeMins, baseUrl) {
    const base = baseUrl || process.env.APP_BASE_URL || "http://localhost:5000";
    return `${base}/api/reminders/snooze?taskId=${taskId}&mins=${snoozeMins}`;
}

function formatDeadline(deadline) {
    if (!deadline || deadline === "Not specified") return "Not specified";
    const d = new Date(deadline);
    if (isNaN(d.getTime())) return deadline;
    return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "full", timeStyle: "short" });
}

// ── Single reminder email ─────────────────────────────────────────
async function sendReminderEmail(to, task, reminderType, unsubscribeToken) {
    try {
        const transporter    = getTransporter();
        const unsubscribeUrl = buildUnsubscribeUrl(to, unsubscribeToken || task.unsubscribeToken || "");

        const snooze15  = buildSnoozeUrl(task._id, 15);
        const snooze60  = buildSnoozeUrl(task._id, 60);
        const snooze1d  = buildSnoozeUrl(task._id, 1440);

        const priorityColor = {
            High:   "#e53935",
            Medium: "#fb8c00",
            Low:    "#43a047"
        }[task.priority] || "#555";

        const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:Arial,sans-serif;background:#f5f7fb;margin:0;padding:20px;">
  <div style="max-width:600px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.1);">
    <div style="background:#111;padding:24px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:22px;">DeadlineBuddy ⏰</h1>
      <p style="color:#aaa;margin:4px 0 0;">${reminderType}</p>
    </div>
    <div style="padding:28px;">
      <h2 style="margin-top:0;color:#111;">${task.title || "Task Reminder"}</h2>

      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr>
          <td style="padding:8px 0;color:#555;width:120px;"><strong>Deadline</strong></td>
          <td style="padding:8px 0;color:#111;">${formatDeadline(task.deadline)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#555;"><strong>Priority</strong></td>
          <td style="padding:8px 0;">
            <span style="background:${priorityColor};color:#fff;padding:2px 10px;border-radius:12px;font-size:13px;">${task.priority || "N/A"}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#555;"><strong>Category</strong></td>
          <td style="padding:8px 0;color:#111;">${task.category || "General"}</td>
        </tr>
      </table>

      ${task.summary ? `
      <div style="background:#f7f7f7;border-radius:8px;padding:14px;margin-bottom:20px;">
        <strong style="color:#111;">Summary</strong>
        <p style="margin:6px 0 0;color:#444;">${task.summary}</p>
      </div>` : ""}

      ${task.actionItems && task.actionItems.length > 0 ? `
      <div style="margin-bottom:20px;">
        <strong style="color:#111;">Action Items</strong>
        <ul style="margin:8px 0;padding-left:20px;color:#444;">
          ${task.actionItems.map(a => `<li style="margin-bottom:4px;">${a}</li>`).join("")}
        </ul>
      </div>` : ""}

      <div style="background:#fff8e1;border-left:4px solid #fbc02d;padding:12px;border-radius:4px;margin-bottom:24px;">
        <strong>Snooze this reminder:</strong>
        <p style="margin:8px 0 0;">
          <a href="${snooze15}" style="margin-right:12px;color:#1565c0;text-decoration:none;">⏱ 15 min</a>
          <a href="${snooze60}" style="margin-right:12px;color:#1565c0;text-decoration:none;">⏱ 1 hour</a>
          <a href="${snooze1d}" style="color:#1565c0;text-decoration:none;">⏱ Tomorrow</a>
        </p>
      </div>
    </div>
    <div style="background:#f5f7fb;padding:16px;text-align:center;font-size:12px;color:#999;">
      <p style="margin:0;">You're receiving this because you have a task due soon.</p>
      <p style="margin:6px 0 0;">
        <a href="${unsubscribeUrl}" style="color:#999;">Unsubscribe from all reminders</a>
      </p>
    </div>
  </div>
</body>
</html>`;

        await transporter.sendMail({
            from:    `"DeadlineBuddy" <${process.env.EMAIL_USER}>`,
            to,
            subject: `${reminderType}: ${task.title}`,
            html
        });

        logger.info("Reminder email sent", { to, taskId: String(task._id), reminderType });
        return true;

    } catch (err) {
        logger.error("Failed to send reminder email", { to, error: err.message });
        return false;
    }
}

// ── Daily digest email ────────────────────────────────────────────
async function sendDigestEmail(to, tasks, unsubscribeToken) {
    if (!tasks || tasks.length === 0) return;

    try {
        const transporter    = getTransporter();
        const unsubscribeUrl = buildUnsubscribeUrl(to, unsubscribeToken || "");

        const taskRows = tasks.map(t => {
            const color = { High: "#e53935", Medium: "#fb8c00", Low: "#43a047" }[t.priority] || "#555";
            return `
            <tr style="border-bottom:1px solid #eee;">
              <td style="padding:12px 8px;color:#111;">${t.title}</td>
              <td style="padding:12px 8px;color:#555;">${formatDeadline(t.deadline)}</td>
              <td style="padding:12px 8px;">
                <span style="background:${color};color:#fff;padding:2px 8px;border-radius:10px;font-size:12px;">${t.priority}</span>
              </td>
            </tr>`;
        }).join("");

        const html = `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f5f7fb;margin:0;padding:20px;">
  <div style="max-width:620px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.1);">
    <div style="background:#111;padding:24px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:22px;">DeadlineBuddy — Daily Digest 📋</h1>
      <p style="color:#aaa;margin:4px 0 0;">${new Date().toDateString()}</p>
    </div>
    <div style="padding:28px;">
      <p style="color:#444;">You have <strong>${tasks.length} task${tasks.length !== 1 ? "s" : ""}</strong> with upcoming deadlines:</p>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f5f7fb;">
            <th style="padding:10px 8px;text-align:left;color:#555;font-size:13px;">Task</th>
            <th style="padding:10px 8px;text-align:left;color:#555;font-size:13px;">Deadline</th>
            <th style="padding:10px 8px;text-align:left;color:#555;font-size:13px;">Priority</th>
          </tr>
        </thead>
        <tbody>${taskRows}</tbody>
      </table>
    </div>
    <div style="background:#f5f7fb;padding:16px;text-align:center;font-size:12px;color:#999;">
      <a href="${unsubscribeUrl}" style="color:#999;">Unsubscribe from reminders</a>
    </div>
  </div>
</body>
</html>`;

        await transporter.sendMail({
            from:    `"DeadlineBuddy" <${process.env.EMAIL_USER}>`,
            to,
            subject: `DeadlineBuddy Daily Digest — ${tasks.length} upcoming deadline${tasks.length !== 1 ? "s" : ""}`,
            html
        });

        logger.info("Digest email sent", { to, taskCount: tasks.length });
        return true;

    } catch (err) {
        logger.error("Failed to send digest email", { to, error: err.message });
        return false;
    }
}

module.exports = {
    sendReminderEmail,
    sendDigestEmail,
    generateUnsubscribeToken
};