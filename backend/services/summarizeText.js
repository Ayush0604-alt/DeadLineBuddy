function summarizeText(text) {

    const lines = text
        .split("\n")
        .filter(line => line.trim() !== "");

    return lines
        .slice(0, 5)
        .join(" ");

}

module.exports = summarizeText;