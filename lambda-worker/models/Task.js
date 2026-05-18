/**
 * Task Model — Lambda Worker
 * Mirrors backend/models/Task.js (kept separate to avoid cross-package imports).
 */

const mongoose = require("mongoose");
const crypto   = require("crypto");

const taskSchema = new mongoose.Schema({

    title:    { type: String, required: true, trim: true },
    summary:  { type: String, default: "" },
    category: { type: String, default: "General" },
    priority: { type: String, enum: ["High", "Medium", "Low"], default: "Low" },
    deadline: { type: String, default: "Not specified" },
    reason:   { type: String, default: "" },

    user:      { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    userEmail: { type: String, default: "", lowercase: true },

    actionItems: { type: [String], default: [] },
    s3Url:       { type: String, default: "" },
    sourceType:  { type: String, default: "FILE" },

    // Deduplication
    dedupHash: { type: String, index: true, sparse: true },

    remindersSent: {
        type:    Object,
        default: { sevenDay: false, oneDay: false, oneHour: false, tenMinute: false }
    },

    reminderSent:      { type: Boolean, default: false },
    snoozedUntil:      { type: Date,    default: null },
    snoozeCount:       { type: Number,  default: 0 },
    unsubscribeToken:  { type: String,  default: null, sparse: true },
    unsubscribedAt:    { type: Date,    default: null },
    remindersDisabled: { type: Boolean, default: false },
    digestMode:        { type: Boolean, default: false },
    escalated:         { type: Boolean, default: false },
    originalPriority:  { type: String,  default: null },

    createdAt: { type: Date, default: Date.now }

}, { timestamps: true });

// Auto-generate dedupHash before save
taskSchema.pre("save", function (next) {
    if (this.isNew || this.isModified("title") || this.isModified("userEmail") || this.isModified("deadline")) {
        const raw = `${(this.title || "").toLowerCase().trim()}|${(this.userEmail || "").toLowerCase().trim()}|${(this.deadline || "").trim()}`;
        this.dedupHash = crypto.createHash("sha256").update(raw).digest("hex");
    }
    next();
});

module.exports = mongoose.model("Task", taskSchema);