import fs from 'fs'
import path from 'path'

import request from 'supertest'
import rmfr from 'rmfr'

import app from './express'
import expressRouter from '@/express'
import JsonStore from '@/store/json'

describe('test the async store', () => {
  let agent: request.SuperTest<request.Test>
  const tmpFolder = 'tmp/async'
  const jsonStorePath = path.resolve(__dirname, '..', tmpFolder)
  const initConfig = {
    foo: {
      cur: 0,
      total: 10,
      done: false,
      filename: 'foo.txt'
    }
  }
  const store = new JsonStore(jsonStorePath, 'store.json', initConfig)

  beforeAll(() => {
    app.use('/dnu', expressRouter({
      store, assetsFolder: tmpFolder, chunksFolder: tmpFolder
    }))
    agent = request(app)
  })

  afterAll(() => {
    rmfr(path.resolve(__dirname, '../', tmpFolder))
  })

  test('should init store json file and init config', () => {
    expect(fs.existsSync(jsonStorePath)).toBe(true)
  })

  test('should get the chunk meta by uuid', async () => {
    const uuid = 'foo'
    const meta = await store.get(uuid)

    expect(meta).toEqual({
      cur: 0,
      total: 10,
      done: false,
      filename: 'foo.txt'
    })
  })

  test('should set the chunk meta by uuid', async () => {
    const uuid = 'bar'

    await store.set(uuid, {
      cur: 0,
      total: 8,
      done: false,
      filename: 'bar.txt'
    })

    const meta = await store.get(uuid)

    expect(meta).toEqual({
      cur: 0,
      total: 8,
      done: false,
      filename: 'bar.txt'
    })
  })

  test('should delete the chunk meta by uuid', async () => {
    const uuid = 'baz'

    await store.set(uuid, {
      cur: 0,
      total: 8,
      done: false,
      filename: 'baz.txt'
    })

    const isDeleted = await store.delete(uuid)

    expect(isDeleted).toBe(true)

    const meta = await store.get(uuid)

    expect(meta).toBeUndefined()
  })

  test('should know the chunk meta is existed by uuid', async () => {
    const uuid = 'baz'

    await store.set(uuid, {
      cur: 0,
      total: 8,
      done: false,
      filename: 'baz.txt'
    })

    const isExisted1 = await store.exist(uuid)
    const isExisted2 = await store.exist('unknow')

    expect(isExisted1).toBe(true)
    expect(isExisted2).toBe(false)
  })

  test('should work fine during the whole upload process', async () => {
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
      .expect(200)

    expect(fs.existsSync(path.resolve(__dirname, `../${tmpFolder}/${uuid}-1`))).toBe(true)

    // await agent.post('/dnu/upload_end').send({ uuid })

    // expect(fs.existsSync(path.resolve(__dirname, `../${chunksFolder}/${uuid}-0`))).toBe(false)
    // expect(fs.existsSync(path.resolve(__dirname, `../${chunksFolder}/${uuid}-1`))).toBe(false)

    // expect(fs.existsSync(path.resolve(__dirname, `../${assetsFolder}/${filename}`))).toBe(true)
    // expect(fs.readFileSync(path.resolve(__dirname, `../${assetsFolder}/${filename}`)).toString()).toBe('chunk0chunk1')
  })
})