function classifyCategory(text) {

    const lowerText =
        text.toLowerCase();

    if (
        lowerText.includes("hackathon")
    ) {
        return "Hackathon";
    }

    if (
        lowerText.includes("assignment")
    ) {
        return "Assignment";
    }

    if (
        lowerText.includes("exam")
    ) {
        return "Exam";
    }

    if (
        lowerText.includes("internship")
    ) {
        return "Internship";
    }

    if (
        lowerText.includes("fee")
    ) {
        return "Fee Payment";
    }

    return "General";

}

module.exports =
classifyCategory;