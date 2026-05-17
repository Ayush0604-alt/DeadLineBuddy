const {
    GoogleGenerativeAI
} = require("@google/generative-ai");


const genAI =
new GoogleGenerativeAI(
    process.env.GEMINI_API_KEY
);


async function analyzeDocument(text) {

    try {

        const model =
            genAI.getGenerativeModel({
                model: "gemini-1.5-flash"
            });


        const prompt = `

You are an AI assistant.

Analyze this document and return:

1. Short summary
2. Main deadline
3. Task category
4. Important action items
5. Priority level

Document:

${text}

Return response in clean JSON format.

`;


        const result =
            await model.generateContent(
                prompt
            );

        const response =
            await result.response;

        return response.text();

    } catch (error) {

        console.log(error);

        return null;

    }

}

module.exports =
analyzeDocument;