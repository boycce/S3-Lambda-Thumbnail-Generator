require('dotenv/config')
let generator = require('../index')
let aws = require('aws-sdk')
let bucket = process.env.awsBucket
let s3 = new aws.S3({
  accessKeyId: process.env.awsAccessKeyId,
  secretAccessKey: process.env.awsSecretAccessKey,
})

let images = [
  // e.g.
  // '-CZ8t9_dhkuW6yqopXoHU.jpg',
  // '-vxpViaJDXR0oz2kUdC0v.jpg',
]

async function start() {
  // Resizes an array of s3:{bucket}/full/ images
  try {
    for (let filename of images) {
      console.log(`Filename: ${filename}`)
      let key = 'full/' + filename
      let keyEncoded = 'full/' + encodeURIComponent(filename)

      let res = await s3.getObject({
        Bucket: bucket,
        Key: key,
      }).promise()

      await generator.handler({
        // Last updated 2022.06.22
        'Records': [
          {
            'eventVersion': '2.0',
            'eventSource': 'aws:s3',
            'awsRegion': 'us-east-1',
            'eventTime': '1970-01-01T00:00:00.000Z',
            'eventName': 'ObjectCreated:Put',
            'userIdentity': {
              'principalId': 'EXAMPLE'
            },
            'requestParameters': {
              'sourceIPAddress': '127.0.0.1'
            },
            'responseElements': {
              'x-amz-request-id': 'EXAMPLE123456789',
              'x-amz-id-2': 'EXAMPLE123/5678abcdefghijklambdaisawesome/mnopqrstuvwxyzABCDEFGH'
            },
            's3': {
              's3SchemaVersion': '1.0',
              'configurationId': 'testConfigRule',
              'bucket': {
                'name': bucket,
                'ownerIdentity': {
                  'principalId': 'EXAMPLE'
                },
                'arn': `arn:aws:s3:::${bucket}`
              },
              'object': {
                'key': keyEncoded,
                'size': res.ContentLength,
                'eTag': res.ETag,
                'sequencer': '0A1B2C3D4E5F678901',
              }
            }
          }
        ]
      }, {})

      console.log('Success')
    }
  } catch (e) {
    console.error(e)
  }
}

start()
