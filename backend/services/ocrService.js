const Tesseract = require("tesseract.js");

async function extractTextFromImage(imagePath) {

    try {

        const result =
            await Tesseract.recognize(
                imagePath,
                "eng"
            );

        return result.data.text;

    } catch (error) {

        console.log(error);

        return "";

    }

}

module.exports = extractTextFromImage;