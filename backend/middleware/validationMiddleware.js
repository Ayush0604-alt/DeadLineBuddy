/**
 * Request Validation Middleware
 * Schema-based validation for all incoming requests
 */

const { createLogger } = require("../utils/logger");
const logger = createLogger("Validator");

/**
 * Validates req.body against a schema object.
 * Schema shape: { fieldName: { type, required, minLength, maxLength, isEmail, isDate } }
 */
function validate(schema) {
    return (req, res, next) => {
        const errors = [];

        for (const [field, rules] of Object.entries(schema)) {
            const value = req.body[field];
            const isEmpty = value === undefined || value === null || String(value).trim() === "";

            // Required check
            if (rules.required && isEmpty) {
                errors.push(`'${field}' is required`);
                continue;
            }

            // Skip further checks if not provided and not required
            if (isEmpty) continue;

            const strVal = String(value).trim();

            // Type check
            if (rules.type === "string" && typeof value !== "string") {
                errors.push(`'${field}' must be a string`);
            }

            if (rules.type === "number" && isNaN(Number(value))) {
                errors.push(`'${field}' must be a number`);
            }

            // minLength
            if (rules.minLength && strVal.length < rules.minLength) {
                errors.push(`'${field}' must be at least ${rules.minLength} characters`);
            }

            // maxLength
            if (rules.maxLength && strVal.length > rules.maxLength) {
                errors.push(`'${field}' must be at most ${rules.maxLength} characters`);
            }

            // Email format
            if (rules.isEmail) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(strVal)) {
                    errors.push(`'${field}' must be a valid email address`);
                }
            }

            // Date format
            if (rules.isDate) {
                const parsed = new Date(value);
                if (isNaN(parsed.getTime())) {
                    errors.push(`'${field}' must be a valid date`);
                }
                if (rules.futureDate && parsed < new Date()) {
                    errors.push(`'${field}' must be a future date`);
                }
            }

            // Enum check
            if (rules.enum && !rules.enum.includes(strVal)) {
                errors.push(`'${field}' must be one of: ${rules.enum.join(", ")}`);
            }
        }

        if (errors.length > 0) {
            logger.warn("Request validation failed", { errors, path: req.path, body: req.body });
            return res.status(400).json({
                message: "Validation failed",
                errors
            });
        }

        next();
    };
}

// ========================
// Pre-built schemas
// ========================

const schemas = {
    register: {
        name:     { type: "string", required: true, minLength: 2, maxLength: 100 },
        email:    { type: "string", required: true, isEmail: true },
        password: { type: "string", required: true, minLength: 6, maxLength: 128 }
    },

    login: {
        email:    { type: "string", required: true, isEmail: true },
        password: { type: "string", required: true, minLength: 1 }
    },

    createTask: {
        title:       { type: "string", required: true, minLength: 1, maxLength: 200 },
        description: { type: "string", required: false, maxLength: 2000 },
        category:    { type: "string", required: false, maxLength: 100 },
        deadline:    { type: "string", required: true, isDate: true, futureDate: false }
    },

    snoozeReminder: {
        taskId:      { type: "string", required: true },
        snoozeMins:  {
            type: "number",
            required: true,
            enum: ["15", "30", "60", "120", "1440"] // 15m, 30m, 1h, 2h, 1d
        }
    },

    unsubscribe: {
        email: { type: "string", required: true, isEmail: true },
        token: { type: "string", required: true }
    }
};

module.exports = { validate, schemas };