// Node 8.10
var aws = require("aws-sdk")
var fs = require("fs")
var mktemp = require("mktemp")
var gm = require("gm").subClass({ imageMagick: true })
var s3 = new aws.S3()

var settings = {
  // Allowed filetypes
  filetypes: ['png', 'jpg', 'jpeg',  'bmp', 'tiff', 'gif'],
  // Thumbnail sizes (excluding 'full')
  sizes: [
    { name: "small", width: null, height: 200 },
    { name: "medium", width: null, height: 750 },
    { name: "large", width: null, height: 1600 }
  ]
}

exports.handler = (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false
  var tempFile
  var processing = true
  var bucket = event.Records[0].s3.bucket.name
  var key = decodeURIComponent(event.Records[0].s3.object.key).replace(/\+/g, ' ')
  var filename = key.replace(/^full\//, '')
  var fileType = (filename.match(/\.\w+$/)? filename.match(/\.\w+$/)[0] : '').substr(1).toLowerCase()

  console.log('Filename:', filename)
  console.log('File Type:', fileType)
  console.log('Key:', key)
  console.log('Bucket:', bucket)
  console.log('Settings:', settings)

  // Catch resizing timeouts here so aws doesn't restart the request 3 times,
  // make this number 1 second less than the lambda timeout
  var timeout = setTimeout(function() { error('Timed out..') }, 8000)

  for (var size of settings.sizes) {
    if (filename.indexOf(size.name + '/') === 0) return error()
  }
  if (fileType === '') {
    return error(`No filetype found for key: ${filename}`)
  }
  if (settings.filetypes.indexOf(fileType) === -1) {
    return error(`Filetype ${fileType} isn't a valid file for resizing.`)
  }

  s3.getObject({ Bucket: bucket, Key: key }, (err, res) => {
    if (err) return error(err)
    var data = res.Body

    if (fileType === 'gif') {
      tempFile = mktemp.createFileSync("/tmp/XXXXXXXXXX.gif")
      fs.writeFileSync(tempFile, res.Body)
      data = tempFile + "[0]"
    }

    Promise.all(settings.sizes.map((size) => {
      return new Promise((resolve, reject) => {
        gm(data).size({ bufferStream: true }, function(err, curSize) {
          if (err) return reject('Size error:' + err)
          var height = curSize.height > size.height? size.height : curSize.height
          /*
            * Resizing is time expensive part..
            * If the image is smaller than the the targeted height, keep the original image
            * height and just convert to jpg for the thumbnail's display
            */

          console.log('Size: ', size.width, 'Height:', height)

          this.resize(size.width, height).toBuffer("jpg", (err, buffer) => {
            console.log('Error this.resize:', err)
            console.log('Bucket:', bucket)
            console.log('Buffer:', buffer)

            if (err) return reject(`Unable to generate images for '${bucket}/${filename}', error: ` + err)

            console.log('Key:', size.name + '/' + filename.replace(/\.\w+$/, ".jpg"))

            s3.putObject({
              Bucket: bucket,
              Key: size.name + '/' + filename.replace(/\.\w+$/, ".jpg"),
              Body: buffer,
              ContentType: "image/jpg",
              ACL: 'public-read',
              Metadata: { thumbnail: 'TRUE' }
            }, (err) => {
              console.log('Error putObject:', err)

              if (err) {
                reject(err)
              } else {
                resolve()
              }
            })
          })
        })
      })

    })).then(() => {
      // for handling executions after callback() which messes up logging? lol
      if (!processing) return
      if (timeout) clearTimeout(timeout)
      if (tempFile) fs.unlinkSync(tempFile)
      console.log(`Created new images for '${bucket}/${filename}'`)
      processing = false
      callback()

    }).catch(err => {
      console.log('Error:', err)

      error(err)
    })
  })

  function error(err) {
    // for handling executions after callback() which messes up logging? lol
    if (!processing) return
    if (timeout) clearTimeout(timeout)
    if (tempFile) fs.unlinkSync(tempFile)
    if (err) console.error(`Error: ${err}`)
    processing = false
    callback()
  }
}
