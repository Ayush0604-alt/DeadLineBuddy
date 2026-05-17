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


// DELETE TASK
exports.deleteTask = async (req, res) => {

    try {

        await Task.findByIdAndDelete(req.params.id);

        res.status(200).json({
            message: "Task deleted"
        });

    } catch (error) {

        res.status(500).json({
            message: error.message
        });

    }

};