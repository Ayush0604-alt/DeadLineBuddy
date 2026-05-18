/**
 * User Model
 * Extended with digest preference and global reminder opt-out.
 */

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },

        email: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true
        },

        password: {
            type: String,
            required: true
        },

        // Global opt-out — if true, no reminder emails are ever sent
        remindersDisabled: {
            type: Boolean,
            default: false
        },

        // If true, all tasks belonging to this user use digest mode by default
        digestModeDefault: {
            type: Boolean,
            default: false
        },

        // Token used in one-click unsubscribe links
        unsubscribeToken: {
            type: String,
            default: null,
            index: true,
            sparse: true
        },

        unsubscribedAt: {
            type: Date,
            default: null
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);