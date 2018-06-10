import fs from 'fs'
import path from 'path'

import request from 'supertest'
import rmfr from 'rmfr'
import express from 'express'

import expressRouter from '@/dnu_express'
import MemoryStore from '@/store/memory'

describe('test the express router', () => {
  let agent: request.SuperTest<request.Test>
  const tmpFolder = 'tmp/express'
  const store = new MemoryStore()
  const app = express()

  beforeAll(() => {
    app.get('/', (req, res) => {
      res.status(200).send('Hello World!')
    })
    app.use('/dnu', expressRouter({
      store, assetsFolder: tmpFolder, chunksFolder: tmpFolder
    }))
    agent = request(app)
  })

  afterAll(() => {
    rmfr(path.resolve(__dirname, '../', tmpFolder))
  })

  test('server should startup succesfully', () => {
    return agent.get('/').expect(200, 'Hello World!')
  })

  test('root path should return welcome status', () => {
    return agent.get('/dnu').expect(200, 'dnu index')
  })

  test('requiredFieldsGuard should block request without required fields', () => {
    const uuid = 'foo'

    return agent.post('/dnu/upload_start').send({ uuid })
      .expect(400, { msg: 'lack of required fields' })
  })

  test('chunkMetaGuard should block unexist uuid request', async () => {
    const uuid = 'unexist'

    await agent.get(`/dnu/status/${uuid}`)
      .expect(404, { uuid, err: 'unexist' })
  })

  test('/status/:uuid should return correct task status', async () => {
    const uuid = 'bar'
    const total = 10
    const filename = 'bar.txt'

    await agent.post('/dnu/upload_start').send({ uuid, total, filename })

    const secondRes = await agent.get(`/dnu/status/${uuid}`)
      .expect(302, { uuid, status: 'pending' })
  })

  test('/upload_start should build new upload task', () => {
    const uuid = 'foo'
    const total = 10
    const filename = 'foo.txt'

    return agent.post('/dnu/upload_start').send({ uuid, total, filename })
      .expect(201, { uuid, status: 'start', target: '/dnu/upload/foo/0' })
  })

  test('/upload/:uuid/:idx should return next target', async () => {
    const uuid = 'baz'
    const total = 10
    const filename = 'baz.txt'

    await agent.post('/dnu/upload_start').send({ uuid, total, filename })

    return agent.post(`/dnu/upload/${uuid}/0`)
      .expect(202, { uuid, status: 'pending', target: `/dnu/upload/${uuid}/1` })
  })

  test('/upload/:uuid/:idx should return done status when task has done', async () => {
    const uuid = 'xor'
    const total = 2
    const filename = 'xor.txt'

    await agent.post('/dnu/upload_start').send({ uuid, total, filename })

    await agent.post(`/dnu/upload/${uuid}/0`)

    await agent.post(`/dnu/upload/${uuid}/1`)
      .expect(200, { uuid, status: 'done' })
  })

  test('/upload/:uuid/:idx should return error if idx is out-range or not number', async () => {
    const uuid = 'hoo'
    const total = 10
    const filename = 'hoo.txt'

    await agent.post('/dnu/upload_start').send({ uuid, total, filename })

    await agent.post(`/dnu/upload/${uuid}/-1`)
      .expect(400, { uuid, err: 'idx out-range' })

    await agent.post(`/dnu/upload/${uuid}/11`)
      .expect(400, { uuid, err: 'idx out-range' })

    await agent.post(`/dnu/upload/${uuid}/number`)
      .expect(400, { uuid, err: 'invalid idx' })

    await agent.post(`/dnu/upload/${uuid}/1`)
      .expect(400, { uuid, err: 'invalid idx' })
  })

  test('/upload/:uuid/:idx should upload chunk successfully', async () => {
    const uuid = 'pot'
    const total = 2
    const filename = 'pot.txt'

    await agent.post('/dnu/upload_start').send({ uuid, total, filename })

    await agent.post(`/dnu/upload/${uuid}/0`)
      .set('Content-Type', 'application/octet-stream')
      .send('chunk0')
      .expect(202, { uuid, status: 'pending', target: `/dnu/upload/${uuid}/1` })

    expect(fs.existsSync(path.resolve(__dirname, `../${tmpFolder}/${uuid}-0`))).toBe(true)

    await agent.post(`/dnu/upload/${uuid}/1`)
      .set('Content-Type', 'application/octet-stream')
      .send('chunk1')
      .expect(200, { uuid, status: 'done' })

    expect(fs.existsSync(path.resolve(__dirname, `../${tmpFolder}/${uuid}-1`))).toBe(true)
  })

  test('/upload_end should concat related ${chunksFolder} to the whole asset', async () => {
    const uuid = 'tob'
    const total = 2
    const filename = 'tob.txt'

    await agent.post('/dnu/upload_start').send({ uuid, total, filename })

    await agent.post(`/dnu/upload/${uuid}/0`)
      .set('Content-Type', 'application/octet-stream')
      .send('chunk0')

    expect(fs.existsSync(path.resolve(__dirname, `../${tmpFolder}/${uuid}-0`))).toBe(true)

    await agent.post(`/dnu/upload/${uuid}/1`)
      .set('Content-Type', 'application/octet-stream')
      .send('chunk1')

    expect(fs.existsSync(path.resolve(__dirname, `../${tmpFolder}/${uuid}-1`))).toBe(true)

    await agent.post('/dnu/upload_end').send({ uuid })

    expect(fs.existsSync(path.resolve(__dirname, `../${tmpFolder}/${uuid}-0`))).toBe(false)
    expect(fs.existsSync(path.resolve(__dirname, `../${tmpFolder}/${uuid}-1`))).toBe(false)

    expect(fs.existsSync(path.resolve(__dirname, `../${tmpFolder}/${filename}`))).toBe(true)
    expect(fs.readFileSync(path.resolve(__dirname, `../${tmpFolder}/${filename}`)).toString()).toBe('chunk0chunk1')
  })

  test('/upload_abort should abort existed upload task', async () => {
    const uuid = 'hiss'
    const total = 2
    const filename = 'hiss.txt'

    await agent.post('/dnu/upload_start').send({ uuid, total, filename })

    await agent.post(`/dnu/upload/${uuid}/0`)
      .set('Content-Type', 'application/octet-stream')
      .send('chunk0')
      .expect(202, { uuid, status: 'pending', target: `/dnu/upload/${uuid}/1` })

    expect(fs.existsSync(path.resolve(__dirname, `../${tmpFolder}/${uuid}-0`))).toBe(true)

    await agent.post('/dnu/upload_abort').send({ uuid })
      .expect(200, { uuid, msg: 'aborted' })

    expect(fs.existsSync(path.resolve(__dirname, `../${tmpFolder}/${uuid}-0`))).toBe(false)
  })
})
