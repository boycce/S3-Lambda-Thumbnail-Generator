require('dotenv/config')
let aws = require('aws-sdk')
// let fs = require('fs')
let bucket = process.env.awsBucket
let s3 = new aws.S3({
  accessKeyId: process.env.awsAccessKeyId,
  secretAccessKey: process.env.awsSecretAccessKey,
})

async function start() {
  // Find any difference between the buckets: full/large/medium/small
  try {
    let all = {}
    let f = (await s3.listObjects({Bucket: bucket, Prefix: 'full/'}).promise()).Contents
    let l = (await s3.listObjects({Bucket: bucket, Prefix: 'large/'}).promise()).Contents
    let m = (await s3.listObjects({Bucket: bucket, Prefix: 'medium/'}).promise()).Contents
    let s = (await s3.listObjects({Bucket: bucket, Prefix: 'small/'}).promise()).Contents

    for (let image of f) {
      let filename = image.Key.replace(/^full\/|\.[a-z]{3,5}$/ig, '')
      all[filename] = 1
    }
    for (let image of l) {
      let filename = image.Key.replace(/^large\/|\.[a-z]{3,5}$/ig, '')
      if (!all[filename]) all[filename] = 1
      else all[filename]++
    }
    for (let image of m) {
      let filename = image.Key.replace(/^medium\/|\.[a-z]{3,5}$/ig, '')
      if (!all[filename]) all[filename] = 1
      else all[filename]++
    }
    for (let image of s) {
      let filename = image.Key.replace(/^small\/|\.[a-z]{3,5}$/ig, '')
      if (!all[filename]) all[filename] = 1
      else all[filename]++
    }
    for (let filename of Object.keys(all)) {
      if (all[filename] != 4) console.log(filename, all[filename])
    }

    console.log(f.length, l.length, m.length, s.length)
  } catch (e) {
    console.error(e)
  }
}

start()
