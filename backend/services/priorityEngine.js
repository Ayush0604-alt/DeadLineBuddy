function calculatePriority(deadline) {

    const now = new Date();

    const dueDate = new Date(deadline);

    const diffHours =
        (dueDate - now) /
        (1000 * 60 * 60);

    if (diffHours <= 24) {

        return "High";

    }

    if (diffHours <= 72) {

        return "Medium";

    }

    return "Low";

}

module.exports =
calculatePriority;