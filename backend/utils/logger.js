/**
 * Centralized Logger
 * Structured, leveled logging with timestamps
 */

const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

const CURRENT_LEVEL = LOG_LEVELS[
    (process.env.LOG_LEVEL || "INFO").toUpperCase()
] ?? LOG_LEVELS.INFO;

function formatMessage(level, context, message, meta) {
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        context,
        message,
        ...(meta && Object.keys(meta).length > 0 ? { meta } : {})
    };
    return JSON.stringify(entry);
}

function createLogger(context = "App") {
    return {
        debug(message, meta = {}) {
            if (CURRENT_LEVEL <= LOG_LEVELS.DEBUG) {
                console.debug(formatMessage("DEBUG", context, message, meta));
            }
        },
        info(message, meta = {}) {
            if (CURRENT_LEVEL <= LOG_LEVELS.INFO) {
                console.log(formatMessage("INFO", context, message, meta));
            }
        },
        warn(message, meta = {}) {
            if (CURRENT_LEVEL <= LOG_LEVELS.WARN) {
                console.warn(formatMessage("WARN", context, message, meta));
            }
        },
        error(message, meta = {}) {
            if (CURRENT_LEVEL <= LOG_LEVELS.ERROR) {
                const metaWithStack = meta instanceof Error
                    ? { errorMessage: meta.message, stack: meta.stack }
                    : meta;
                console.error(formatMessage("ERROR", context, message, metaWithStack));
            }
        }
    };
}

module.exports = { createLogger };