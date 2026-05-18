/**
 * Task Controller
 * Improved with: dedup detection, input sanitization, structured errors
 */

const Task = require("../models/Task");
const { createLogger } = require("../utils/logger");

const logger = createLogger("TaskController");

// ── CREATE TASK ───────────────────────────────────────────────────
exports.createTask = async (req, res) => {
    try {
        const {
            title,
            description,
            category,
            deadline
        } = req.body;

        // Duplicate detection
        const { isDup, existing } = await Task.isDuplicate(title, req.user.email || "", deadline);
        if (isDup) {
            logger.warn("Duplicate task creation prevented", {
                userId:    req.user.id,
                title,
                existingId: String(existing._id)
            });
            return res.status(409).json({
                message:    "A task with the same title and deadline already exists",
                existingId: existing._id
            });
        }

        const task = await Task.create({
            user:        req.user.id,
            userEmail:   req.user.email || "",
            title:       title.trim(),
            description: description?.trim() || "",
            category:    category?.trim() || "General",
            deadline
        });

        logger.info("Task created", { taskId: String(task._id), userId: req.user.id });
        return res.status(201).json(task);

    } catch (err) {
        logger.error("createTask error", { error: err.message });
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ── GET TASKS ─────────────────────────────────────────────────────
exports.getTasks = async (req, res) => {
    try {
        const { category, priority, search } = req.query;

        const filter = { user: req.user.id };

        if (category) filter.category = category;
        if (priority)  filter.priority = priority;
        if (search) {
            filter.$or = [
                { title:   { $regex: search, $options: "i" } },
                { summary: { $regex: search, $options: "i" } }
            ];
        }

        const tasks = await Task.find(filter).sort({ deadline: 1 });

        logger.debug("Tasks fetched", { userId: req.user.id, count: tasks.length });
        return res.status(200).json(tasks);

    } catch (err) {
        logger.error("getTasks error", { error: err.message });
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ── DELETE TASK ───────────────────────────────────────────────────
exports.deleteTask = async (req, res) => {
    try {
        const task = await Task.findOneAndDelete({
            _id:  req.params.id,
            user: req.user.id
        });

        if (!task) {
            return res.status(404).json({ message: "Task not found or unauthorized" });
        }

        logger.info("Task deleted", { taskId: req.params.id, userId: req.user.id });
        return res.status(200).json({ message: "Task deleted" });

    } catch (err) {
        logger.error("deleteTask error", { error: err.message });
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ── UPDATE TASK ───────────────────────────────────────────────────
exports.updateTask = async (req, res) => {
    try {
        const allowed = ["title", "description", "category", "deadline", "priority", "digestMode"];
        const updates = {};

        for (const key of allowed) {
            if (req.body[key] !== undefined) {
                updates[key] = req.body[key];
            }
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: "No valid fields to update" });
        }

        const task = await Task.findOneAndUpdate(
            { _id: req.params.id, user: req.user.id },
            { $set: updates },
            { new: true, runValidators: true }
        );

        if (!task) {
            return res.status(404).json({ message: "Task not found or unauthorized" });
        }

        logger.info("Task updated", { taskId: req.params.id, userId: req.user.id, updates });
        return res.status(200).json(task);

    } catch (err) {
        logger.error("updateTask error", { error: err.message });
        return res.status(500).json({ message: "Internal server error" });
    }
};