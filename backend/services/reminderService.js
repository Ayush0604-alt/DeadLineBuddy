const cron =
require("node-cron");

const nodemailer =
require("nodemailer");

const Task =
require("../models/Task");


// ======================
// EMAIL TRANSPORT
// ======================

const transporter =
nodemailer.createTransport({

    service: "gmail",

    auth: {

        user:
        process.env.EMAIL_USER,

        pass:
        process.env.EMAIL_PASS

    }

});


// ======================
// REMINDER WINDOWS
// ======================

const sevenDays =
7 * 24 * 60 * 60 * 1000;

const oneDay =
24 * 60 * 60 * 1000;

const oneHour =
60 * 60 * 1000;

const tenMinutes =
10 * 60 * 1000;


// ======================
// START REMINDER ENGINE
// ======================

const startReminderEngine = () => {

    console.log(
        "Reminder Engine Started"
    );


    // Runs every minute
    cron.schedule("* * * * *", async () => {

        console.log(
            "Checking reminders..."
        );

        try {

            const tasks =
            await Task.find();


            for (
                const task
                of tasks
            ) {

                try {

                    // ======================
                    // VALIDATE DEADLINE
                    // ======================

                    if (

                        !task.deadline ||

                        task.deadline ===
                        "Not specified"

                    ) {

                        console.log(
                            "Skipping (no deadline):",
                            task.title
                        );

                        continue;

                    }


                    // ======================
                    // VALIDATE USER EMAIL
                    // ======================

                    if (
                        !task.userEmail
                    ) {

                        console.log(
                            "Skipping (no email):",
                            task.title
                        );

                        continue;

                    }


                    const deadline =
                    new Date(
                        task.deadline
                    );


                    if (
                        isNaN(deadline)
                    ) {

                        console.log(
                            "Invalid deadline:",
                            task.deadline
                        );

                        continue;

                    }


                    const now =
                    new Date();


                    const diff =
                    deadline - now;


                    // ======================
                    // SKIP EXPIRED TASKS
                    // ======================

                    if (
                        diff <= 0
                    ) {

                        console.log(
                            "Deadline passed:",
                            task.title
                        );

                        continue;

                    }


                    console.log(
                        "Task:",
                        task.title
                    );

                    console.log(
                        "Diff:",
                        diff
                    );


                    // ======================
                    // DETERMINE REMINDER TYPE
                    // ======================

                    let reminderType =
                    null;


                    // 7 DAY REMINDER
                    if (

                        diff < sevenDays &&
                        diff > oneDay &&
                        !task.remindersSent?.sevenDay

                    ) {

                        reminderType =
                        "7 Day Reminder";

                        task.remindersSent.sevenDay =
                        true;

                    }


                    // 1 DAY REMINDER
                    else if (

                        diff < oneDay &&
                        diff > oneHour &&
                        !task.remindersSent?.oneDay

                    ) {

                        reminderType =
                        "1 Day Reminder";

                        task.remindersSent.oneDay =
                        true;

                    }


                    // 1 HOUR REMINDER
                    else if (

                        diff < oneHour &&
                        diff > tenMinutes &&
                        !task.remindersSent?.oneHour

                    ) {

                        reminderType =
                        "1 Hour Reminder";

                        task.remindersSent.oneHour =
                        true;

                    }


                    // FINAL REMINDER
                    else if (

                        diff < tenMinutes &&
                        diff > 0 &&
                        !task.remindersSent?.tenMinute

                    ) {

                        reminderType =
                        "Final Reminder";

                        task.remindersSent.tenMinute =
                        true;

                    }


                    // ======================
                    // SEND REMINDER
                    // ======================

                    if (
                        reminderType
                    ) {

                        console.log(
                            "Sending:",
                            reminderType
                        );

                        console.log(
                            "To:",
                            task.userEmail
                        );


                        const mailOptions = {

                            from:
                            process.env.EMAIL_USER,

                            to:
                            task.userEmail,

                            subject:
                            `${reminderType}: ${task.title}`,

                            text: `

Deadline Reminder ⏰

Reminder Type:
${reminderType}

Task:
${task.title}

Deadline:
${task.deadline}

Priority:
${task.priority}

Category:
${task.category}

Why this matters:
${task.reason}

Summary:
${task.summary}

Action Items:
${task.actionItems.join("\n")}

`

                        };


                        const info =
                        await transporter.sendMail(
                            mailOptions
                        );


                        console.log(
                            "Email Sent:",
                            info.response
                        );


                        // ======================
                        // SAVE TASK
                        // ======================

                        await task.save();


                        console.log(
                            "Reminder State Updated"
                        );

                    }

                } catch (taskError) {

                    console.log(
                        "Task Processing Error:",
                        taskError
                    );

                }

            }

        } catch (error) {

            console.log(
                "Reminder Engine Error:",
                error
            );

        }

    });

};


module.exports =
startReminderEngine;