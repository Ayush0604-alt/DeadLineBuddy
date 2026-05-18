const { GoogleGenAI } =
require("@google/genai");


const ai =
new GoogleGenAI({

    apiKey:
    process.env.GEMINI_API_KEY

});


const SYSTEM_PROMPT = `

You are DeadlineBuddy AI.

Analyze uploaded documents and return:

1. Short summary
2. Main deadline
3. Task category
4. Important action items
5. Priority level

Return clean JSON.

`;


async function analyzeDocument(text) {

    try {

        const prompt = `

${SYSTEM_PROMPT}

Document:

${text}

`;


        const response =
            await ai.models.generateContent({

                model:
                "gemini-2.5-flash",

                contents:
                prompt

            });


        return response.text;

    } catch (error) {

        console.log(
            "AI Error:",
            error
        );

        return null;

    }

}


module.exports =
analyzeDocument;