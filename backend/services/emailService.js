const nodemailer = require("nodemailer");

const sendReminderEmail = async (
    to,
    task
) => {

    try {

        const transporter = nodemailer.createTransport({

            service: "gmail",

            auth: {

                user: process.env.EMAIL_USER,

                pass: process.env.EMAIL_PASS

            }

        });

        const mailOptions = {

            from: process.env.EMAIL_USER,

            to,

            subject: `Reminder: ${task.title}`,

            html: `
                <h2>Deadline Reminder ⏰</h2>

                <p>
                    Your task
                    <b>${task.title}</b>
                    is approaching deadline.
                </p>

                <p>
                    Deadline:
                    ${new Date(task.deadline).toDateString()}
                </p>

                <p>
                    Description:
                    ${task.description}
                </p>
            `

        };

        await transporter.sendMail(mailOptions);

        console.log(`Reminder sent to ${to}`);

    } catch (error) {

        console.log(error);

    }

};

module.exports = sendReminderEmail;