const chrono = require("chrono-node");

function smartDeadlineExtractor(text) {

    if (!text) return null;

    const keywords = [

        "deadline",
        "last date",
        "submit before",
        "due date",
        "apply before",
        "registration closes",
        "submission deadline"

    ];

    const lowerText =
        text.toLowerCase();

    for (const keyword of keywords) {

        if (lowerText.includes(keyword)) {

            const date =
                chrono.parseDate(text);

            if (date) {

                return date;

            }

        }

    }

    return null;

}

module.exports =
smartDeadlineExtractor;