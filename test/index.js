require('dotenv/config')
let generator = require('../index')
let aws = require('aws-sdk')
let fs = require('fs')
let s3 = new aws.S3({
  accessKeyId: process.env.awsAccessKeyId,
  secretAccessKey: process.env.awsSecretAccessKey,
})

async function start() {
  try {
    let res1 = await s3.upload({
      ACL: 'public-read',
      Bucket: process.env.awsBucket,
      Key: 'full/test.jpg',
      Body: fs.readFileSync('./test/test.jpg'),
      Metadata: { small: '*x100', medium: '*x750', large: '*x1600' }, // not used in test
    }).promise()

    let res2 = await s3.getObject({
      Bucket: process.env.awsBucket,
      Key: 'full/test.jpg',
    }).promise()
    // console.log(res1, res2)

    generator.handler({
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
              'name': res1.Bucket,
              'ownerIdentity': {
                'principalId': 'EXAMPLE'
              },
              'arn': `arn:aws:s3:::${res1.Bucket}`
            },
            'object': {
              'key': encodeURIComponent(res1.key),
              'size': res2.ContentLength,
              'eTag': res1.ETag,
              'sequencer': '0A1B2C3D4E5F678901',
              ...Object.keys(res2.Metadata||{}).reduce((acc, key) => {
                acc[`x-amz-meta-${key}`] = res2.Metadata[key]
                return acc
              }, {}),
            }
          }
        }
      ]
    }, {})
  } catch (e) {
    console.error(e)
  }
}

start()
