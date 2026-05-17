const Imap = require("node-imap");

const { simpleParser } = require("mailparser");

const fs = require("fs");

const path = require("path");

const pdfParse = require("pdf-parse");

const Task = require("../models/Task");

const User = require("../models/User");

const summarizeText =
require("./summarizeText");

const smartDeadlineExtractor =
require("./smartDeadlineExtractor");

const classifyCategory =
require("./categoryClassifier");

const calculatePriority =
require("./priorityEngine");

const analyzeDocument =
require("./aiService");


// IMAP CONFIG
const imap = new Imap({

    user: process.env.EMAIL_USER,

    password: process.env.EMAIL_PASS,

    host: process.env.EMAIL_HOST,

    port: process.env.EMAIL_PORT,

    tls: true

});


// OPEN INBOX
function openInbox(cb) {

    imap.openBox("INBOX", false, cb);

}


// PROCESS EMAILS
function processEmails() {

    imap.search(
        ["UNSEEN"],
        (err, results) => {

            if (err) {

                console.log(err);

                return;

            }

            if (!results || results.length === 0) {

                return;

            }

            const fetch = imap.fetch(
                results,
                {
                    bodies: "",
                    markSeen: true
                }
            );


            // PROCESS EACH EMAIL
            fetch.on("message", (msg) => {

                msg.on("body", (stream) => {

                    simpleParser(
                        stream,
                        async (err, parsed) => {

                            try {

                                console.log(
                                    "\n===== NEW EMAIL ====="
                                );

                                console.log(
                                    "From:",
                                    parsed.from.text
                                );

                                console.log(
                                    "Subject:",
                                    parsed.subject
                                );

                                console.log(
                                    "Text:",
                                    parsed.text
                                );


                                // FIND USER
                                const user =
                                    await User.findOne({

                                        email:
                                        parsed.from.value[0].address

                                    });


                                // EMAIL DEADLINE
                                const emailDeadline =
                                    smartDeadlineExtractor(
                                        parsed.text || ""
                                    );

                                console.log(
                                    "Extracted Deadline:",
                                    emailDeadline
                                );


                                // EMAIL SUMMARY
                                const emailSummary =
                                    summarizeText(
                                        parsed.text || ""
                                    );


                                // EMAIL CATEGORY
                                const emailCategory =
                                    classifyCategory(
                                        parsed.text || ""
                                    );


                                // EMAIL PRIORITY
                                const emailPriority =
                                    calculatePriority(
                                        emailDeadline
                                    );


                                // CREATE EMAIL TASK
                                if (
                                    user &&
                                    emailDeadline
                                ) {

                                    await Task.create({

                                        user: user._id,

                                        title:
                                        parsed.subject,

                                        description:
                                        parsed.text,

                                        summary:
                                        emailSummary,

                                        category:
                                        emailCategory,

                                        priority:
                                        emailPriority,

                                        deadline:
                                        emailDeadline

                                    });

                                    console.log(
                                        "Task created from email"
                                    );

                                }


                                // ATTACHMENTS
                                if (
                                    parsed.attachments &&
                                    parsed.attachments.length > 0
                                ) {

                                    console.log(
                                        "Attachments Found"
                                    );


                                    for (
                                        const attachment
                                        of parsed.attachments
                                    ) {

                                        try {

                                            const filePath =
                                                path.join(

                                                    __dirname,

                                                    "../uploads",

                                                    attachment.filename

                                                );


                                            // SAVE FILE
                                            fs.writeFileSync(

                                                filePath,

                                                attachment.content

                                            );


                                            console.log(
                                                "Saved:",
                                                attachment.filename
                                            );


                                            // PDF PROCESSING
                                            if (

                                                attachment.contentType ===
                                                "application/pdf"

                                            ) {

                                                console.log(
                                                    "Reading PDF..."
                                                );


                                                const dataBuffer =
                                                    fs.readFileSync(
                                                        filePath
                                                    );


                                                const pdfData =
                                                    await pdfParse(
                                                        dataBuffer
                                                    );


                                                console.log(
                                                    "\n===== PDF TEXT ====="
                                                );

                                                console.log(
                                                    pdfData.text
                                                );


                                                // AI ANALYSIS
                                                const aiResult =
                                                    await analyzeDocument(
                                                        pdfData.text
                                                    );


                                                console.log(
                                                    "\n===== AI ANALYSIS ====="
                                                );

                                                console.log(
                                                    aiResult
                                                );


                                                // PDF DEADLINE
                                                const pdfDeadline =
                                                    smartDeadlineExtractor(
                                                        pdfData.text
                                                    );

                                                console.log(
                                                    "PDF Deadline:",
                                                    pdfDeadline
                                                );


                                                // PDF CATEGORY
                                                const category =
                                                    classifyCategory(
                                                        pdfData.text
                                                    );


                                                // PDF PRIORITY
                                                const priority =
                                                    calculatePriority(
                                                        pdfDeadline
                                                    );


                                                // PDF SUMMARY
                                                const pdfSummary =
                                                    summarizeText(
                                                        pdfData.text
                                                    );

                                                console.log(
                                                    "\n===== PDF SUMMARY ====="
                                                );

                                                console.log(
                                                    pdfSummary
                                                );


                                                // CREATE PDF TASK
                                                if (
                                                    user &&
                                                    pdfDeadline
                                                ) {

                                                    await Task.create({

                                                        user:
                                                        user._id,

                                                        title:
                                                        attachment.filename,

                                                        description:
                                                        pdfData.text,

                                                        summary:
                                                        pdfSummary,

                                                        category,

                                                        priority,

                                                        deadline:
                                                        pdfDeadline

                                                    });

                                                    console.log(
                                                        "PDF task created"
                                                    );

                                                }

                                            }

                                        } catch (pdfError) {

                                            console.log(
                                                "PDF Error:",
                                                pdfError
                                            );

                                        }

                                    }

                                }

                            } catch (error) {

                                console.log(
                                    "Email Processing Error:",
                                    error
                                );

                            }

                        }
                    );

                });

            });

        }
    );

}


// READY
imap.once("ready", () => {

    openInbox((err, box) => {

        if (err) throw err;

        console.log("Inbox opened");


        // INITIAL CHECK
        processEmails();


        // REALTIME EMAIL LISTENER
        imap.on("mail", () => {

            console.log(
                "\nNew mail detected!"
            );

            // SMALL DELAY
            setTimeout(() => {

                processEmails();

            }, 2000);

        });

    });

});


// ERRORS
imap.once("error", (err) => {

    console.log(
        "IMAP Error:",
        err
    );

});


// END
imap.once("end", () => {

    console.log(
        "Connection ended"
    );

});


module.exports = imap;