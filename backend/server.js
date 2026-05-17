const express = require("express");
const cors = require("cors");

require("dotenv").config();
require("./services/reminderCron");

const authMiddleware = require("./middleware/authMiddleware");
const connectDB = require("./config/db");

connectDB();

const app = express();

app.use(cors());
app.use(express.json());


// ROUTES
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/tasks", require("./routes/taskRoutes"));


app.get("/", (req, res) => {
    res.send("DeadlineBuddy API Running 🚀");
});

app.get("/api/protected", authMiddleware, (req, res) => {
    res.json({
        message: "Protected route accessed",
        user: req.user
    });
});


// IMAP — start with crash protection
// If email credentials are missing or wrong, server still runs
if (
    process.env.EMAIL_USER &&
    process.env.EMAIL_PASS &&
    process.env.EMAIL_HOST &&
    process.env.EMAIL_PORT
) {

    try {

        const imap = require("./services/emailReader");

        imap.connect();

        console.log("IMAP connecting...");

    } catch (err) {

        console.log("IMAP failed to start (server still running):", err.message);

    }

} else {

    console.log("⚠️  IMAP skipped — EMAIL env vars not set");

}


const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});