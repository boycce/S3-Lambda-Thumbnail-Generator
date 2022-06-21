let aws = require('aws-sdk')
let fs = require('fs')
let mktemp = require('mktemp')
let gm = require('gm').subClass({ imageMagick: true })
let s3 = new aws.S3()

let settings = {
  filetypes: ['png', 'jpg', 'jpeg',  'bmp', 'tiff', 'gif'], // Allowed filetypes
  sizes: [ // Default thumbnail sizes
    { name: 'small', width: null, height: 300 },
    { name: 'medium', width: null, height: 800 },
    { name: 'large', width: null, height: 1400 },
  ],
}

exports.handler = async (event, context) => {
  /**
    @param {object} event - see test/index.js
  */
  let processing = true
  try {
    let bucket = event.Records[0].s3.bucket.name
    let key = decodeURIComponent(event.Records[0].s3.object.key).replace(/\+/g, ' ')
    let filename = key.replace(/^full\//, '')
    let fileType = (filename.match(/\.\w+$/)? filename.match(/\.\w+$/)[0] : '').substr(1).toLowerCase()
    let sizes = getSizes(event.Records[0].s3.object) || settings.sizes
    console.log({ filename, fileType, key, bucket, sizes })

    // This is required since we cancel long running executings via the timeout
    context.callbackWaitsForEmptyEventLoop = false

    if (!key.match(/^full\//)) {
      throw new Error(`Skipping put to ${filename}`)

    } else if (fileType === '') {
      throw new Error(`No filetype found for key: ${filename}`)

    } else if (settings.filetypes.indexOf(fileType) === -1) {
      throw new Error(`Filetype ${fileType} isn't a valid file for resizing.`)

    } else if (sizes.find(o => !o.name || o.name == 'full')) { // protect against recursion
      throw new Error(`Invalid size name in [${sizes.map(o => o.name).join(',')}].`)
    }

    // Get the image and acl
    let [image, imageAcl] = await Promise.all([
      s3.getObject({ Bucket: bucket, Key: key, }).promise(),
      s3.getObjectAcl({ Bucket: bucket, Key: key, }).promise(),
    ])

    // Removing animation? (forgot what this was for)
    if (fileType === 'gif') {
      var tempFile = mktemp.createFileSync('/tmp/XXXXXXXXXX.gif')
      fs.writeFileSync(tempFile, image.Body)
      image.Body = tempFile + '[0]'
    }

    // Loop sizes
    await Promise.all(sizes.map(size => {
      return new Promise((resolve, reject) => {
        gm(image.Body).size({ bufferStream: true }, function(err, curSize) {
          if (err) return reject('Size error:' + err)
          // Resizing is the time expensive part..
          // If the image is smaller than the the targeted height, keep the original image
          // height and just convert to jpg for the thumbnail's display
          let height = curSize.height > size.height ? size.height : curSize.height
          this.resize(size.width, height).toBuffer('jpg', async (err, buffer) => {
            if (err) return reject(`Unable to generate images for '${bucket}/${filename}', error: ` + err)
            try {
              // Save the image, and upadate its ACL
              await s3.putObject({
                Bucket: bucket,
                Key: size.name + '/' + filename.replace(/\.\w+$/, '.jpg'),
                Body: buffer,
                ContentType: 'image/jpg',
                Metadata: { thumbnail: 'TRUE' }
              }).promise()
              await s3.putObjectAcl({
                Bucket: bucket,
                Key: size.name + '/' + filename.replace(/\.\w+$/, '.jpg'),
                AccessControlPolicy: imageAcl,
              }).promise()
              resolve()
            } catch (err) {
              reject(err)
            }
          })
        })
      })
    }))

    // Ignore logging after this function has ended, caused by callbackWaitsForEmptyEventLoop
    if (!processing) return
    else processing = false
    if (tempFile) fs.unlinkSync(tempFile)
    console.log(`Created new images for '${bucket}/${filename}'`)

  } catch (err) {
    // Ignore logging after this function has ended, caused by callbackWaitsForEmptyEventLoop
    if (!processing) return
    else processing = false
    if (tempFile) fs.unlinkSync(tempFile)
    console.error(err)
  }
}

function getSizes(object) {
  let sizes = []
  for (let key in object) {
    if (key.match(/^x-amz-meta-(small|medium|large)$/)) {
      let width = object[key].split('x')[0]
      let height = object[key].split('x')[1]
      sizes.push({
        name: key.match(/(small|medium|large)$/)[1],
        width: width == '*' ? null : parseInt(width),
        height: height == '*' ? null : parseInt(height),
      })
    }
  }
  return sizes.length ? sizes : null
}
