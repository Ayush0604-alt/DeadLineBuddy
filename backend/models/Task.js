/**
 * Task Model
 * Extended with: snooze, unsubscribe token, digest mode, dedup hash,
 * reminder escalation, and per-window sent tracking.
 */

const mongoose = require("mongoose");
const crypto   = require("crypto");

const taskSchema = new mongoose.Schema({

    // ── Core fields ──────────────────────────────────────────────
    title:    { type: String, required: true, trim: true },
    summary:  { type: String, default: "" },
    category: { type: String, default: "General", trim: true },
    priority: { type: String, enum: ["High", "Medium", "Low"], default: "Low" },
    deadline: { type: String, default: "Not specified" },
    reason:   { type: String, default: "" },

    // ── User association ─────────────────────────────────────────
    user:      { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    userEmail: { type: String, default: "", trim: true, lowercase: true },

    // ── AI extras ────────────────────────────────────────────────
    actionItems: { type: [String], default: [] },
    s3Url:       { type: String, default: "" },
    sourceType:  { type: String, default: "MANUAL" },

    // ── Deduplication hash (SHA-256 of title + userEmail + deadline) ──
    dedupHash: { type: String, index: true, sparse: true },

    // ── Reminder tracking ─────────────────────────────────────────
    remindersSent: {
        type: Object,
        default: {
            sevenDay:   false,
            oneDay:     false,
            oneHour:    false,
            tenMinute:  false
        }
    },

    // Legacy single-flag used by reminderCron.js
    reminderSent: { type: Boolean, default: false },

    // ── Snooze ────────────────────────────────────────────────────
    snoozedUntil: { type: Date, default: null },
    snoozeCount:  { type: Number, default: 0 },

    // ── Unsubscribe ───────────────────────────────────────────────
    unsubscribeToken:  { type: String, default: null, index: true, sparse: true },
    unsubscribedAt:    { type: Date,   default: null },
    remindersDisabled: { type: Boolean, default: false },

    // ── Daily digest preference ───────────────────────────────────
    digestMode: { type: Boolean, default: false },

    // ── Escalation ────────────────────────────────────────────────
    escalated:        { type: Boolean, default: false },
    originalPriority: { type: String, default: null },

    createdAt: { type: Date, default: Date.now }

}, { timestamps: true });


// ── Pre-save: generate dedupHash ──────────────────────────────────
// Use async form (no `next` param) — required for Mongoose 9.x
taskSchema.pre("save", async function () {
    if (
        this.isNew ||
        this.isModified("title") ||
        this.isModified("userEmail") ||
        this.isModified("deadline")
    ) {
        const raw = [
            (this.title     || "").toLowerCase().trim(),
            (this.userEmail || "").toLowerCase().trim(),
            (this.deadline  || "").trim()
        ].join("|");

        this.dedupHash = crypto.createHash("sha256").update(raw).digest("hex");
    }
});

// ── Static: find duplicate ────────────────────────────────────────
taskSchema.statics.isDuplicate = async function (title, userEmail, deadline) {
    const raw = [
        (title     || "").toLowerCase().trim(),
        (userEmail || "").toLowerCase().trim(),
        (deadline  || "").trim()
    ].join("|");

    const hash     = crypto.createHash("sha256").update(raw).digest("hex");
    const existing = await this.findOne({ dedupHash: hash });
    return { isDup: !!existing, existing };
};

module.exports = mongoose.model("Task", taskSchema);