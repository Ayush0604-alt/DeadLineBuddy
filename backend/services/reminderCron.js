const cron = require("node-cron");

const Task = require("../models/Task");

const User = require("../models/User");

const sendReminderEmail = require("./emailService");


// RUN EVERY MINUTE
cron.schedule("* * * * *", async () => {

    console.log("Checking reminders...");


    try {

        // NEXT 24 HOURS
        const now = new Date();

        const next24Hours = new Date(
            now.getTime() + 24 * 60 * 60 * 1000
        );

        // FIND TASKS
        const tasks = await Task.find({

            deadline: {

                $gte: now,

                $lte: next24Hours

            },

            reminderSent: false

        });

        for (const task of tasks) {

            const user = await User.findById(task.user);

            if (!user) continue;

            // SEND EMAIL
            await sendReminderEmail(
                user.email,
                task
            );

            // UPDATE STATUS
            task.reminderSent = true;

            await task.save();

        }

    } catch (error) {

        console.log(error);

    }

});