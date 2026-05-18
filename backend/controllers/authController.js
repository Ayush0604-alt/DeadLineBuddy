/**
 * Auth Controller
 * Improved with: structured logging, consistent error messages,
 * unsubscribe token generation on register.
 */

const User   = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt    = require("jsonwebtoken");
const crypto = require("crypto");
const { createLogger } = require("../utils/logger");

const logger = createLogger("AuthController");

// ── REGISTER ──────────────────────────────────────────────────────
exports.registerUser = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            logger.warn("Register: email already exists", { email });
            return res.status(409).json({ message: "An account with this email already exists" });
        }

        const hashedPassword     = await bcrypt.hash(password, 12);
        const unsubscribeToken   = crypto.randomBytes(32).toString("hex");

        const user = await User.create({
            name:             name.trim(),
            email:            email.toLowerCase().trim(),
            password:         hashedPassword,
            unsubscribeToken
        });

        logger.info("User registered", { userId: String(user._id), email: user.email });

        return res.status(201).json({
            message: "Account created successfully"
        });

    } catch (err) {
        logger.error("registerUser error", { error: err.message });
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ── LOGIN ─────────────────────────────────────────────────────────
exports.loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            // Use generic message to prevent user enumeration
            logger.warn("Login: user not found", { email });
            return res.status(401).json({ message: "Invalid email or password" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            logger.warn("Login: incorrect password", { userId: String(user._id) });
            return res.status(401).json({ message: "Invalid email or password" });
        }

        const token = jwt.sign(
            { id: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        logger.info("User logged in", { userId: String(user._id) });

        return res.status(200).json({
            message: "Login successful",
            token
        });

    } catch (err) {
        logger.error("loginUser error", { error: err.message });
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ── GET PROFILE ───────────────────────────────────────────────────
exports.getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select("-password -unsubscribeToken");
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        return res.status(200).json(user);
    } catch (err) {
        logger.error("getProfile error", { error: err.message });
        return res.status(500).json({ message: "Internal server error" });
    }
};