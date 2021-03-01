# S3-lambda-thumbnail-generator

## Usage
An Amazon Web Services Lambda function that generates thumbnails from images uploaded to AWS S3.

Example:
* **Event**: Uploading an image to S3 (a.k.a S3 PUT)
* **Function**: Generate thumbnail for the uploaded image and place it in a thumbnail folder

## Install Bucket

1. Create a S3 bucket
1. Create an IAM user, e.g. `Corex` (you'll be writting to this bucket via the user's API credentials)
2. Create an IAM policy, e.g. `CorexBucketsOnly`, and attach the user to this policy. [See policy example below](#s3-bucket-policy-example)

## Install Lambda

1. Log in to your AWS account
2. Click on **Lambda** from the list of the available services
3. Click on **Get Started**
4. From the left menu choose **Configure triggers**
    - Choose **S3** from the list of available events/services
    - Make sure you choose the appropriate **Bucket** name
    - Choose **Put** for event type
    - (optional) Type in a prefix path for images to trigger events for
    - (optional) Choose what type of files to handle (png, jpg, etc..)
    - Enable trigger and click **Next**
5. Configuring function
    * Give your function any name you want, add an optional description, and choose **Node.js 8.10** as your runtime
    * Upload **Thumbnailer.zip** as is
    * Create a new **role**, give it a name, and attach to it **S3 object read-only permission** policy
    * Hit **Next** then **Create function**, and you're good to go!
6. *Wahoo, Once you upload an image to your S3 bucket, an event will be triggered and your image will have a thumbnail automatically generated for it in a thumbnail folder.*

## Customization

You can customise the setting defaults in `index.js`

After modifying this file, you **MUST** compress it with **node_modules** folder and upload it again to Lambda.
If you receive "module not found" errors in the console, this is probably due the zip file having
the incorrect permissions set before zipping. (linux: you cannot use a umask'd ntfs partition)

```js
var settings = {
  // Allowed filetypes
  filetypes: ['png', 'jpg', 'jpeg',  'bmp', 'tiff', 'gif'],
  // Thumbnail sizes (excluding 'full')
  sizes: [
    { name: "small", width: null, height: 450 },
    { name: "medium", width: null, height: 1000 },
    { name: "large", width: null, height: 1600 }
  ]
}
```

## S3 Bucket policy example
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Action": "s3:ListAllMyBuckets",
            "Effect": "Allow",
            "Resource": "arn:aws:s3:::*"
        },
        {
            "Action": "s3:*",
            "Effect": "Allow",
            "Resource": [
                "arn:aws:s3:::corex-dev",
                "arn:aws:s3:::corex-dev/*",
                "arn:aws:s3:::corex-staging",
                "arn:aws:s3:::corex-staging/*",
                "arn:aws:s3:::corex-prod",
                "arn:aws:s3:::corex-prod/*"
            ]
        }
    ]
}
```
