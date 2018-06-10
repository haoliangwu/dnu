const express = require('express')
const dnu = require('../lib')

const app = express()

app.use('/dnu', dnu.expressRouter({
  assetsFolder: 'assets',
  chunksFolder: 'chunks'
}))

app.listen(3000, () => {
  console.log('server listen at 127:0.0.1:3000.');
})