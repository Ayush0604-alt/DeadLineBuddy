const {
    S3Client,
    PutObjectCommand
} = require("@aws-sdk/client-s3");


const fs = require("fs");


const s3 = new S3Client({

    region: process.env.AWS_REGION,

    credentials: {

        accessKeyId:
        process.env.AWS_ACCESS_KEY,

        secretAccessKey:
        process.env.AWS_SECRET_KEY

    }

});


async function uploadFileToS3(
    filePath,
    fileName
) {

    try {

        const fileContent =
            fs.readFileSync(filePath);

        const command =
            new PutObjectCommand({

                Bucket:
                process.env.AWS_BUCKET_NAME,

                Key:
                fileName,

                Body:
                fileContent

            });


        await s3.send(command);

        console.log(
            "Uploaded to S3"
        );


        return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

    } catch (error) {

        console.log(error);

        return null;

    }

}

module.exports =
uploadFileToS3;