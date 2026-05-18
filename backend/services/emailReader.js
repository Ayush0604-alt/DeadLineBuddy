const Imap = require("node-imap");

const { simpleParser } =
require("mailparser");

const fs =
require("fs");

const path =
require("path");

const uploadFileToS3 =
require("./s3Service");

const sendMessageToQueue =
require("./sqsService");


// ======================
// UPLOADS DIR
// ======================

const uploadsDir =
path.join(
    __dirname,
    "../uploads"
);

fs.mkdirSync(
    uploadsDir,
    { recursive: true }
);


// ======================
// IMAP CONFIG
// ======================

const imap =
new Imap({

    user:
    process.env.EMAIL_USER,

    password:
    process.env.EMAIL_PASS,

    host:
    process.env.EMAIL_HOST,

    port:
    process.env.EMAIL_PORT,

    tls: true

});


// ======================
// OPEN INBOX
// ======================

function openInbox(cb) {

    imap.openBox(
        "INBOX",
        false,
        cb
    );

}


// ======================
// PROCESS EMAILS
// ======================

function processEmails() {

    imap.search(

        ["UNSEEN"],

        (err, results) => {

            if (err) {

                console.log(
                    "Search error:",
                    err
                );

                return;

            }

            if (
                !results ||
                results.length === 0
            ) {

                return;

            }

            const fetch =
            imap.fetch(

                results,

                {
                    bodies: "",
                    markSeen: true
                }

            );


            // ======================
            // EACH EMAIL
            // ======================

            fetch.on(

                "message",

                (msg) => {

                    msg.on(

                        "body",

                        (stream) => {

                            simpleParser(

                                stream,

                                async (
                                    err,
                                    parsed
                                ) => {

                                    if (err) {

                                        console.log(
                                            "Parse error:",
                                            err
                                        );

                                        return;

                                    }

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


                                        // ======================
                                        // ATTACHMENTS
                                        // ======================

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

                                                    // ======================
                                                    // SAVE FILE LOCALLY
                                                    // ======================

                                                    const filePath =
                                                    path.join(

                                                        uploadsDir,

                                                        attachment.filename

                                                    );


                                                    fs.writeFileSync(

                                                        filePath,

                                                        attachment.content

                                                    );


                                                    console.log(
                                                        "Saved:",
                                                        attachment.filename
                                                    );


                                                    // ======================
                                                    // UPLOAD TO S3
                                                    // ======================

                                                    const s3Url =
                                                    await uploadFileToS3(

                                                        filePath,

                                                        attachment.filename

                                                    );


                                                    console.log(
                                                        "Uploaded to S3"
                                                    );

                                                    console.log(
                                                        "S3 URL:",
                                                        s3Url
                                                    );


                                                    // ======================
                                                    // SEND TO SQS
                                                    // ======================

                                                    await sendMessageToQueue({

                                                        fileName:
                                                        attachment.filename,

                                                        s3Url:
                                                        s3Url,

                                                        userEmail:
                                                        parsed.from.value[0].address

                                                    });


                                                    console.log(
                                                        "Message sent to SQS"
                                                    );

                                                } catch (attachmentError) {

                                                    console.log(
                                                        "Attachment Error:",
                                                        attachmentError
                                                    );

                                                }

                                            }

                                        } else {

                                            console.log(
                                                "No Attachments Found"
                                            );
                                           await sendMessageToQueue({

        sourceType:
        "EMAIL",

        emailText:
        parsed.text,

        userEmail:
        parsed.from.value[0].address,

        subject:
        parsed.subject || "Email Reminder"

    });

    console.log(
        "Email body sent to SQS"
    );
                                        }

                                    } catch (error) {

                                        console.log(
                                            "Email Processing Error:",
                                            error
                                        );

                                    }

                                }

                            );

                        }

                    );

                }

            );

        }

    );

}


// ======================
// READY
// ======================

imap.once(

    "ready",

    () => {

        openInbox(

            (err) => {

                if (err) {

                    console.log(
                        "Inbox open error:",
                        err
                    );

                    return;

                }

                console.log(
                    "Inbox opened"
                );


                // INITIAL CHECK
                processEmails();


                // REALTIME LISTENER
                imap.on(

                    "mail",

                    () => {

                        console.log(
                            "\nNew mail detected!"
                        );

                        setTimeout(

                            () => {

                                processEmails();

                            },

                            2000

                        );

                    }

                );

            }

        );

    }

);


// ======================
// ERRORS
// ======================

imap.once(

    "error",

    (err) => {

        console.log(
            "IMAP Error:",
            err
        );

    }

);


// ======================
// END
// ======================

imap.once(

    "end",

    () => {

        console.log(
            "Connection ended"
        );

    }

);


module.exports =
imap;