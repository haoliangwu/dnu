import fs from 'fs'
import path from 'path'

import rmfr from 'rmfr'
import fetch from 'node-fetch'
import express from 'express'

import expressRouter from '@/dnu_express'
import MemoryStore from '@/store/memory'
import DnuClient, { DnuClientOptions } from '@/client'

import { Server } from 'http'

describe('test the dnu client', () => {
  const tmpFolder = 'tmp/client'
  const store = new MemoryStore()
  const app = express()
  const defaultClientOptions: DnuClientOptions = {
    prefix: '/api',
    host: 'http://127.0.0.1:3000'
  }
  const defaultClient = new DnuClient({
    chunkSize: 1024,
    fetch,
    ...defaultClientOptions
  })
  let server: Server

  beforeAll(() => {
    app.use('/api', expressRouter({
      store,
      assetsFolder: tmpFolder,
      chunksFolder: tmpFolder,
      secondPass: true
    }))
    server = app.listen(3000)
  })

  afterAll(() => {
    server.close()
    rmfr(path.resolve(__dirname, '../', tmpFolder))
  })

  test('should calc correct chunks number', () => {
    const buffer1 = new Buffer(1023)
    const buffer2 = new Buffer(1024)
    const buffer3 = new Buffer(1025)

    expect(defaultClient.countChunks(toArrayBuffer(buffer1))).toBe(1)
    expect(defaultClient.countChunks(toArrayBuffer(buffer2))).toBe(1)
    expect(defaultClient.countChunks(toArrayBuffer(buffer3))).toBe(2)
  })

  test('should slice correct chunk', () => {
    const client = new DnuClient({
      chunkSize: 2,
      fetch,
      ...defaultClientOptions
    })
    const buffer1 = new Buffer('abcde')

    expect(toBuffer(client.sliceChunk(0, toArrayBuffer(buffer1)))).toBe('ab')
    expect(toBuffer(client.sliceChunk(1, toArrayBuffer(buffer1)))).toBe('cd')
    expect(toBuffer(client.sliceChunk(2, toArrayBuffer(buffer1)))).toBe('e')
  })

  test('should upload file in serial mode', async () => {
    const filename = 'foo.txt'
    const content = 'chunk0chunk1chunk2!!'
    const client = new DnuClient({
      chunkSize: 6,
      fetch,
      uuid: () => 'foo',
      ...defaultClientOptions
    })
    const buffer = new Buffer(content)

    await client.upload(filename, toArrayBuffer(buffer))

    expect(fs.existsSync(path.resolve(__dirname, `../${tmpFolder}/${filename}`))).toBe(true)
    expect(fs.readFileSync(path.resolve(__dirname, `../${tmpFolder}/${filename}`)).toString()).toBe(content)
  })
  test('should secondPass hook called when creating duplicated task', async () => {
    const filename = 'foo.txt'
    const content = 'chunk0chunk1chunk2!!'
    const spy = jest.fn()
    const client = new DnuClient({
      chunkSize: 6,
      fetch,
      uuid: () => 'foo',
      onChunkUploaded: spy,
      ...defaultClientOptions
    })
    const buffer = new Buffer(content)

    await client.upload(filename, toArrayBuffer(buffer))

    expect(spy).toHaveBeenCalledTimes(0)
  })

  test('should lifecycle hooks have been called with correct times', async () => {
    const filename = 'bar.txt'
    const content = 'chunk0chunk1chunk2!!'
    const spyStart = jest.fn()
    const spyUploaded = jest.fn()
    const spySuccess = jest.fn()
    const spyEnd = jest.fn()
    const client = new DnuClient({
      chunkSize: 6,
      fetch,
      onStart: (meta: any) => {
        spyStart()
        expect(meta).toEqual({ cur: 0, filename: 'bar.txt', total: 4 })
      },
      onChunkUploaded: spyUploaded,
      onSuccess: (meta: any) => {
        spySuccess()
        expect(meta).toEqual({ cur: 4, filename: 'bar.txt', total: 4 })
      },
      onEnd: spyEnd,
      ...defaultClientOptions
    })
    const buffer = new Buffer(content)

    await client.upload(filename, toArrayBuffer(buffer))

    expect(spyStart).toHaveBeenCalledTimes(1)
    expect(spyUploaded).toHaveBeenCalledTimes(4)
    expect(spySuccess).toHaveBeenCalledTimes(1)
    expect(spyEnd).toHaveBeenCalledTimes(1)
  })

  test('should upload file in parellel mode', async () => {
    const filename = 'baz.txt'
    const content = 'chunk0chunk1chunk2!!'
    const client = new DnuClient({
      chunkSize: 6,
      fetch,
      uuid: () => 'baz',
      ...defaultClientOptions
    })
    const buffer = new Buffer(content)

    await client.upload(filename, toArrayBuffer(buffer), {
      concurrency: 2
    })

    expect(fs.existsSync(path.resolve(__dirname, `../${tmpFolder}/${filename}`))).toBe(true)
    expect(fs.readFileSync(path.resolve(__dirname, `../${tmpFolder}/${filename}`)).toString()).toBe(content)
  })
})

function toArrayBuffer (buf: Buffer) {
  let ab = new ArrayBuffer(buf.length)
  let view = new Uint8Array(ab)
  for (let i = 0; i < buf.length; ++i) {
    view[i] = buf[i]
  }
  return ab
}

function toBuffer (ab: ArrayBuffer): string {
  let buf = new Buffer(ab.byteLength)
  let view = new Uint8Array(ab)
  for (let i = 0; i < buf.length; ++i) {
    buf[i] = view[i]
  }
  return buf.toString()
}
