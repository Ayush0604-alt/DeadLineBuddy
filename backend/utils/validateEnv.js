/**
 * Environment Validator
 * Validates all required env vars on startup and fails fast if any are missing.
 */

const { createLogger } = require("./logger");
const logger = createLogger("EnvValidator");

const REQUIRED_VARS = [
    { key: "MONGO_URI",         description: "MongoDB connection string" },
    { key: "JWT_SECRET",        description: "JWT signing secret" },
    { key: "GEMINI_API_KEY",    description: "Google Gemini API key" },
    { key: "AWS_REGION",        description: "AWS region" },
    { key: "AWS_ACCESS_KEY",    description: "AWS access key ID" },
    { key: "AWS_SECRET_KEY",    description: "AWS secret access key" },
    { key: "AWS_BUCKET_NAME",   description: "S3 bucket name" },
    { key: "AWS_SQS_URL",       description: "SQS queue URL" },
    { key: "EMAIL_USER",        description: "Nodemailer sender email" },
    { key: "EMAIL_PASS",        description: "Nodemailer email password" }
];

const OPTIONAL_VARS = [
    { key: "EMAIL_HOST",        description: "IMAP host (optional — enables email reading)" },
    { key: "EMAIL_PORT",        description: "IMAP port (optional — enables email reading)" },
    { key: "PORT",              description: "Express server port (defaults to 5000)" },
    { key: "LOG_LEVEL",         description: "Log level: DEBUG|INFO|WARN|ERROR (defaults to INFO)" }
];

function validateEnv() {
    const missing = [];

    for (const { key, description } of REQUIRED_VARS) {
        if (!process.env[key] || process.env[key].trim() === "") {
            missing.push(`  ✗  ${key}  —  ${description}`);
        } else {
            logger.debug(`Env OK: ${key}`);
        }
    }

    for (const { key, description } of OPTIONAL_VARS) {
        if (!process.env[key]) {
            logger.warn(`Optional env var not set: ${key} — ${description}`);
        }
    }

    if (missing.length > 0) {
        logger.error("Missing required environment variables — server cannot start", {
            missing
        });
        console.error("\n🚨  Missing required environment variables:\n");
        missing.forEach(m => console.error(m));
        console.error("\nFix your .env file and restart.\n");
        process.exit(1);
    }

    logger.info("All required environment variables validated ✓");
}

module.exports = validateEnv;