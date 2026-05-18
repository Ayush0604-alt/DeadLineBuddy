const mongoose =
require("mongoose");


const taskSchema =
new mongoose.Schema({

    title: String,

    summary: String,

    category: String,

    priority: String,

    deadline: String,

    reason: String,
    userEmail: String,

    actionItems: [String],

    s3Url: String,

    remindersSent: {

    type: Object,

    default: {

        sevenDay: false,
        oneDay: false,
        oneHour: false,
        tenMinute: false

    }

},

    createdAt: {

        type: Date,

        default: Date.now

    }

});


module.exports =
mongoose.model(
    "Task",
    taskSchema
);