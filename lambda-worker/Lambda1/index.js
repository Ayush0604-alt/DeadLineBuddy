const {
    S3Client,
    GetObjectCommand
} = require("@aws-sdk/client-s3");

const pdfParse =
require("pdf-parse");

const mammoth =
require("mammoth");

const mongoose =
require("mongoose");

const { GoogleGenAI } =
require("@google/genai");

const fs =
require("fs");

const path =
require("path");

const Task =
require("../models/Task");


// ======================
// GEMINI AI
// ======================

const ai =
new GoogleGenAI({

    apiKey:
    process.env.GEMINI_API_KEY

});


// ======================
// S3 CLIENT
// ======================

const s3 =
new S3Client({

    region:
    process.env.AWS_REGION

});


// ======================
// HELPER
// ======================

async function streamToBuffer(stream) {

    const chunks = [];

    for await (
        const chunk
        of stream
    ) {

        chunks.push(chunk);

    }

    return Buffer.concat(chunks);

}


// ======================
// LAMBDA HANDLER
// ======================

exports.handler =
async (event) => {

    try {

        console.log(
            "Lambda Triggered"
        );


        // ======================
        // CONNECT MONGODB
        // ======================

        if (
            mongoose.connection.readyState === 0
        ) {

            console.log(
                "Connecting MongoDB..."
            );

            await mongoose.connect(

                process.env.MONGO_URI,

                {
                    serverSelectionTimeoutMS: 5000
                }

            );

            console.log(
                "MongoDB Connected"
            );

        }


        // ======================
        // PROCESS EACH RECORD
        // ======================

        for (
            const record
            of event.Records
        ) {

            try {

                const body =
                JSON.parse(
                    record.body
                );

                console.log(
                    "Incoming Body:",
                    body
                );


                let extractedText = "";

                let sourceType =
                body.sourceType || "FILE";


                // ======================
                // EMAIL BODY MODE
                // ======================

                if (
                    sourceType === "EMAIL"
                ) {

                    console.log(
                        "Processing Email Text..."
                    );

                    extractedText =
                    body.emailText || "";

                }


                // ======================
                // FILE MODE
                // ======================

                else {

                    console.log(
                        "Processing File..."
                    );


                    // ======================
                    // DOWNLOAD FILE FROM S3
                    // ======================

                    const command =
                    new GetObjectCommand({

                        Bucket:
                        process.env.AWS_BUCKET_NAME,

                        Key:
                        body.fileName

                    });


                    const response =
                    await s3.send(
                        command
                    );


                    const fileBuffer =
                    await streamToBuffer(
                        response.Body
                    );


                    // ======================
                    // PDF SUPPORT
                    // ======================

                    if (

                        body.fileName
                        .toLowerCase()
                        .endsWith(".pdf")

                    ) {

                        console.log(
                            "Reading PDF..."
                        );

                        const pdfData =
                        await pdfParse(
                            fileBuffer
                        );

                        extractedText =
                        pdfData.text;

                        sourceType =
                        "PDF";

                    }


                    // ======================
                    // DOCX SUPPORT
                    // ======================

                    else if (

                        body.fileName
                        .toLowerCase()
                        .endsWith(".docx")

                    ) {

                        console.log(
                            "Reading DOCX..."
                        );

                        const tempPath =
                        path.join(

                            "/tmp",

                            body.fileName

                        );


                        fs.writeFileSync(

                            tempPath,

                            fileBuffer

                        );


                        const result =
                        await mammoth.extractRawText({

                            path:
                            tempPath

                        });


                        extractedText =
                        result.value;

                        sourceType =
                        "DOCX";

                    }


                    // ======================
                    // TXT SUPPORT
                    // ======================

                    else if (

                        body.fileName
                        .toLowerCase()
                        .endsWith(".txt")

                    ) {

                        console.log(
                            "Reading TXT..."
                        );

                        extractedText =
                        fileBuffer.toString(
                            "utf-8"
                        );

                        sourceType =
                        "TXT";

                    }


                    else {

                        console.log(
                            "Unsupported File Type"
                        );

                        continue;

                    }

                }


                // ======================
                // VALIDATE TEXT
                // ======================

                if (

                    !extractedText ||

                    extractedText.trim()
                    .length === 0

                ) {

                    console.log(
                        "No Extracted Text Found"
                    );

                    continue;

                }


                console.log(
                    "Extracted Text:"
                );

                console.log(
                    extractedText.substring(0, 1500)
                );


                // ======================
                // AI ANALYSIS
                // ======================

                const aiResponse =
                await ai.models.generateContent({

                    model:
                    "gemini-2.5-flash",

                    contents: `

You are an intelligent AI assistant for DeadlineBuddy.

Analyze the provided content carefully.

Return ONLY valid raw JSON.

STRICT JSON FORMAT:

{
  "summary": "...",
  "deadline": "...",
  "priority": "...",
  "category": "...",
  "reason": "...",
  "actionItems": [
    "...",
    "..."
  ],
  "skillsDetected": [
    "...",
    "..."
  ],
  "companyOrOrganization": "...",
  "importantLinks": [
    "..."
  ],
  "isOpportunityRelevant": true
}

RULES:

- Return ONLY raw JSON
- No markdown
- No code blocks
- No explanations outside JSON

SUMMARY:
- concise
- max 2-3 sentences

DEADLINE:
- MUST be ISO format in IST timezone
- Example:
2026-05-18T16:30:00+05:30
- If no deadline:
"Not specified"

PRIORITY:
Allowed:
- High
- Medium
- Low

CATEGORY examples:
- Internship
- Job Opportunity
- Assignment
- Exam
- Event
- Meeting
- Resume
- General

ACTION ITEMS:
- max 5
- short actionable bullets

IMPORTANT:
- Detect deadlines from natural language
- Detect reminders from normal email text
- Ignore decorative text
- Focus on actionable information
- If this is a simple reminder mail, still create meaningful task output

CONTENT:

${extractedText}

`

                });


                // ======================
                // CLEAN AI RESPONSE
                // ======================

                const cleanedResponse =
                aiResponse.text
                    .replace(/```json/g, "")
                    .replace(/```/g, "")
                    .trim();


                console.log(
                    "Raw AI Response:"
                );

                console.log(
                    cleanedResponse
                );


                const parsedAI =
                JSON.parse(
                    cleanedResponse
                );


                console.log(
                    "Parsed AI:"
                );

                console.log(
                    parsedAI
                );


                // ======================
                // SAVE TASK
                // ======================

                await Task.create({

                    title:

                    body.subject ||

                    body.fileName ||

                    "Untitled Task",


                    userEmail:
                    body.userEmail,


                    summary:
                    parsedAI.summary || "",


                    category:
                    parsedAI.category || "General",


                    priority:
                    parsedAI.priority || "Low",


                    deadline:
                    parsedAI.deadline || "Not specified",


                    reason:
                    parsedAI.reason || "",


                    actionItems:
                    parsedAI.actionItems || [],


                    s3Url:
                    body.s3Url || "",


                    sourceType:
                    sourceType

                });


                console.log(
                    "Task Saved to MongoDB"
                );

            } catch (recordError) {

                console.log(
                    "Record Processing Error:",
                    recordError
                );

            }

        }


        return {

            statusCode: 200,

            body: JSON.stringify({

                message:
                "Processing completed"

            })

        };

    } catch (error) {

        console.log(
            "Lambda Fatal Error:",
            error
        );

        throw error;

    }

};