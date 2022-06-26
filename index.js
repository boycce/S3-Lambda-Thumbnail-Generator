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
    { name: 'large', width: null, height: 1200 },
  ],
}

exports.handler = async (event, context) => {
  /**
    @param {object} event - see test/index.js
    @param {object} event.Records[0].s3.object.key - filename always encoded, but not the dir
  */
  try {
    let bucket = event.Records[0].s3.bucket.name
    let keyIn = event.Records[0].s3.object.key
    let key = decodeURIComponent(event.Records[0].s3.object.key).replace(/\+/g, ' ')
    let filename = key.replace(/^full\//, '')
    let fileType = (filename.match(/\.\w+$/)? filename.match(/\.\w+$/)[0] : '').substr(1).toLowerCase()
    console.log({ filename, fileType, keyIn, key, bucket })

    if (!key.match(/^full\//)) { // protect against recursion
      throw new Error(`Skipping put to ${filename}`)

    } else if (fileType === '') {
      throw new Error(`No filetype found for key: ${filename}`)

    } else if (settings.filetypes.indexOf(fileType) === -1) {
      throw new Error(`Filetype ${fileType} isn't a valid file for resizing.`)
    }

    // Get the image and acl
    let [image, imageAcl] = await Promise.all([
      s3.getObject({ Bucket: bucket, Key: key, }).promise(),
      s3.getObjectAcl({ Bucket: bucket, Key: key, }).promise(),
    ])

    // Try to get any sizes set in the metadata
    let sizes = getSizes(image.Metadata) || settings.sizes
    console.log({ sizes })

    // Removing animation? (forgot what this was for)
    if (fileType === 'gif') {
      var tempFile = mktemp.createFileSync('/tmp/XXXXXXXXXX.gif')
      fs.writeFileSync(tempFile, image.Body)
      image.Body = tempFile + '[0]'
    }

    // Loop sizes
    // Note: running below in parallel can throw the error "Stream yields empty buffer" for
    // big images due to memory accumulation. Please refer the readme.md for more information.
    for (const size of sizes) {
      await resize(size, image, imageAcl, bucket, filename)
    }

    // Ignore logging after this function has ended, caused by callbackWaitsForEmptyEventLoop
    if (tempFile) fs.unlinkSync(tempFile)
    console.log(`Created new images for '${bucket}/${filename}'`)

  } catch (err) {
    // Ignore logging after this function has ended, caused by callbackWaitsForEmptyEventLoop
    if (tempFile) fs.unlinkSync(tempFile)
    console.error(err)
  }
}

function getSizes(object) {
  let sizes = []
  for (let key in object) {
    if (key.match(/^small|medium|large$/)) {
      let width = object[key].split('x')[0]
      let height = object[key].split('x')[1]
      sizes.push({
        name: key,
        width: width == '*' ? null : parseInt(width),
        height: height == '*' ? null : parseInt(height),
      })
    }
  }
  return sizes.length ? sizes : null
}

function resize(size, image, imageAcl, bucket, filename) {
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
}

function getMemory() { // eslint-disable-line
  /**
   * Not used, doesn't affect anything..
   * Typically we determine to us 90% of max memory size for ImageMagick
   * @see https://docs.aws.amazon.com/lambda/latest/dg/lambda-environment-variables.html
   * @see https://github.com/ysugimoto/aws-lambda-image/pull/192/commits/91fb1f0cdc1a808a91eadc84422ef632d041989b
   * @see https://github.com/aheckmann/gm/issues/572
   * @use `gm(...).limit('memory', getMemory()).size(...)`
   * @see limit('map', ...)?
   */
  const mem = parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE, 10)
  return Math.floor(mem * 90 / 100)
}
