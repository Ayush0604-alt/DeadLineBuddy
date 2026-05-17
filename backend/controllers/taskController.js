const Task = require("../models/Task");


// CREATE TASK
exports.createTask = async (req, res) => {

    try {

        const {
            title,
            description,
            category,
            deadline
        } = req.body;

        const task = await Task.create({

            user: req.user.id,

            title,
            description,
            category,
            deadline

        });

        res.status(201).json(task);

    } catch (error) {

        res.status(500).json({
            message: error.message
        });

    }

};


// GET TASKS
exports.getTasks = async (req, res) => {

    try {

        const tasks = await Task.find({
            user: req.user.id
        }).sort({
            deadline: 1
        });

        res.status(200).json(tasks);

    } catch (error) {

        res.status(500).json({
            message: error.message
        });

    }

};


// DELETE TASK — ownership check added
exports.deleteTask = async (req, res) => {

    try {

        const task = await Task.findOneAndDelete({
            _id: req.params.id,
            user: req.user.id      // ensures user owns this task
        });

        if (!task) {
            return res.status(404).json({
                message: "Task not found or unauthorized"
            });
        }

        res.status(200).json({
            message: "Task deleted"
        });

    } catch (error) {

        res.status(500).json({
            message: error.message
        });

    }

};