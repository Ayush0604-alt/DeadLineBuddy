const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
{
    user: {

        type: mongoose.Schema.Types.ObjectId,

        ref: "User",

        required: true

    },

    title: {

        type: String,

        required: true

    },

    description: {

        type: String

    },

    summary: {

        type: String

    },

    category: {

        type: String,

        default: "General"

    },

    priority: {

        type: String,

        default: "Low"

    },

    deadline: {

        type: Date,

        required: true

    },

    completed: {

        type: Boolean,

        default: false

    },

    reminderSent: {

        type: Boolean,

        default: false

    }

},
{
    timestamps: true
}
);

module.exports =
mongoose.model("Task", taskSchema);