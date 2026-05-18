const {
    SQSClient,
    SendMessageCommand
} = require("@aws-sdk/client-sqs");


const sqs =
new SQSClient({

    region:
    process.env.AWS_REGION,

    credentials: {

        accessKeyId:
        process.env.AWS_ACCESS_KEY,

        secretAccessKey:
        process.env.AWS_SECRET_KEY

    }

});


async function sendMessageToQueue(data) {

    try {

        const command =
            new SendMessageCommand({

                QueueUrl:
                process.env.AWS_SQS_URL,

                MessageBody:
                JSON.stringify(data)

            });


        await sqs.send(command);

        console.log(
            "Message sent to SQS"
        );

    } catch (error) {

        console.log(error);

    }

}


module.exports =
sendMessageToQueue;