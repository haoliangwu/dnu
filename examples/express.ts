import path from 'path'
import express from 'express'
import { expressRouter } from '../lib'

const app = express()

app.use('/dnu', expressRouter({
  assetsFolder: 'assets',
  chunksFolder: 'chunks'
}))

app.use(express.static(path.resolve(__dirname, 'dist')))
app.get('/', (req, res, next) => {
  res.sendFile(path.resolve(__dirname, 'dist/index.html'))
})

app.listen(3000, () => {
  console.log('server listen at 127:0.0.1:3000.')
})
