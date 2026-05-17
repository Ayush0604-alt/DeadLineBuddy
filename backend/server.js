const express = require("express");
const cors = require("cors");

require("dotenv").config();
require("./services/reminderCron");
const authMiddleware = require("./middleware/authMiddleware");
const connectDB = require("./config/db");
const imap = require("./services/emailReader");

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

const PORT = process.env.PORT || 5000;
imap.connect();
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});