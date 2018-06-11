import fs from 'fs'
import path from 'path'

import request from 'supertest'
import rmfr from 'rmfr'
import express from 'express'
import Koa from 'koa'

import koaRouter from '@/dnu_koa'
import expressRouter from '@/dnu_express'
import JsonStore from '@/store/json'

describe('test the async store', () => {
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

  test('should work fine during the whole upload process(express)', async () => {
    const uuid = 'tob'
    const total = 2
    const filename = 'tob.txt'

    const app = express()
    app.use('/dnu', expressRouter({
      store, assetsFolder: tmpFolder, chunksFolder: tmpFolder
    }))
    const agent = request(app)

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

    await agent.post('/dnu/upload_end').send({ uuid })

    expect(fs.existsSync(path.resolve(__dirname, `../${tmpFolder}/${uuid}-0`))).toBe(false)
    expect(fs.existsSync(path.resolve(__dirname, `../${tmpFolder}/${uuid}-1`))).toBe(false)

    expect(fs.existsSync(path.resolve(__dirname, `../${tmpFolder}/${filename}`))).toBe(true)
    expect(fs.readFileSync(path.resolve(__dirname, `../${tmpFolder}/${filename}`)).toString()).toBe('chunk0chunk1')
  })

  test('should work fine during the whole upload process(koa)', async () => {
    const uuid = 'tob'
    const total = 2
    const filename = 'tob.txt'

    const app = new Koa()
    app.use(koaRouter({
      store, assetsFolder: tmpFolder, chunksFolder: tmpFolder,
      prefix: '/dnu'
    }))
    const koaServer = app.listen()
    const agent = request(koaServer)

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

    await agent.post('/dnu/upload_end').send({ uuid })

    expect(fs.existsSync(path.resolve(__dirname, `../${tmpFolder}/${uuid}-0`))).toBe(false)
    expect(fs.existsSync(path.resolve(__dirname, `../${tmpFolder}/${uuid}-1`))).toBe(false)

    expect(fs.existsSync(path.resolve(__dirname, `../${tmpFolder}/${filename}`))).toBe(true)
    expect(fs.readFileSync(path.resolve(__dirname, `../${tmpFolder}/${filename}`)).toString()).toBe('chunk0chunk1')

    koaServer.close()
  })
})
