import fs from 'fs'
import path from 'path'
import { Transform } from 'stream'

import { RequestHandler, Router, RouterOptions, Request } from 'express'
import bodyparser, { json } from 'body-parser'
import from2 from 'from2'

import store from '@/memoryStore'
import { ChunkMeta } from '@/index'
import { validateChunks, concatChunks, clearChunks, initFolders } from '@/utils'
import { isUndefined } from 'util'

const DEFAULT_TEMP_FOLDER = 'tmp'

// typing
export interface DnuRouterOptions {
  chunksFolder?: string
  assetsFolder?: string
}

interface DnuRequest extends Request {
  meta?: ChunkMeta
}

// middlewares
const requiredFieldsGuardFactory: (fields: string[]) => RequestHandler = (fields: string[]) => {
  return function (req: DnuRequest, res, next) {
    const pred = (field: string) => isUndefined(req.body[field])

    if (fields.some(pred)) {
      return res.status(400).json({ msg: 'lack of required fields' })
    } else {
      next()
    }
  }
}

const chunkMetaGuard: RequestHandler = function (req: DnuRequest, res, next) {
  const uuid = req.params.uuid || req.body.uuid

  if (!store.exist(uuid)) {
    return res.status(404).json({ uuid, err: 'unexist' })
  }

  const meta = store.get(uuid)

  if (!store.isChunkMeta(meta)) {
    return res.status(409).json({ uuid, err: 'conflict' })
  }

  req.meta = meta

  next()
}

// router factory
export default function routerFactory (options?: DnuRouterOptions & RouterOptions) {
  let _chunksFolder = DEFAULT_TEMP_FOLDER
  let _assetsFolder = DEFAULT_TEMP_FOLDER

  if (options) {
    const { chunksFolder, assetsFolder } = options

    _chunksFolder = chunksFolder || _chunksFolder
    _assetsFolder = assetsFolder || _assetsFolder
  }

  initFolders([_chunksFolder, _assetsFolder])

  const router: Router = Router()

  router.use(bodyparser.json())

  router.get('/', (req, res, next) => {
    res.send('dnu index')
  })

  // 查询文件当前上传状态
  router.get('/status/:uuid', chunkMetaGuard, (req, res, next) => {
    const { uuid } = req.params

    if (!store.exist(uuid)) {
      return res.status(404).json({ uuid, err: 'unexist' })
    }

    const meta = store.get(uuid)

    if (!store.isChunkMeta(meta)) {
      return res.status(409).json({ uuid, err: 'conflict' })
    }

    if (meta.done) {
      return res.json({ uuid, status: 'done' })
    } else {
      return res.status(302).json({ uuid, status: 'pending' })
    }
  })

  router.post('/upload_start', requiredFieldsGuardFactory(['uuid', 'total', 'filename']), (req, res, next) => {
    const { uuid, total, filename } = req.body

    store.set(uuid, {
      cur: 0,
      total,
      done: false,
      filename
    })

    res.status(201).json({
      uuid,
      status: 'start',
      target: `${req.baseUrl}/upload/${uuid}/0`
    })
  })

  router.post('/upload/:uuid/:idx', chunkMetaGuard, bodyparser.raw(), (req: DnuRequest, res, next) => {
    const { uuid, idx } = req.params
    const meta = req.meta as ChunkMeta
    const _idx = Number.parseInt(idx)

    // TODO 校验 idx 块是否为冗余块

    // TODO 暂时只支持 顺序 上传
    if (Number.isNaN(_idx)) {
      return res.status(400).json({
        uuid, err: 'invalid idx'
      })
    }

    if (_idx > meta.total || _idx < 0) {
      return res.status(400).json({
        uuid, err: 'idx out-range'
      })
    }

    if (_idx !== meta.cur) {
      return res.status(400).json({
        uuid, err: 'invalid idx'
      })
    }

    if (meta.done) {
      return res.json({ uuid, status: 'done' })
    } else {
      // TODO 储存分片
      if (Buffer.isBuffer(req.body)) {
        let buffer = req.body as Buffer

        const rs = from2((size, next) => {
          if (buffer.byteLength <= 0) return next(null, null)

          const chunk = buffer.slice(0, size)
          buffer = buffer.slice(size)

          next(null, chunk)
        })

        const ws = fs.createWriteStream(`${_chunksFolder}/${uuid}-${meta.cur}`)

        rs.pipe(ws)
          .on('error', err => {
            if (err) return res.status(500).json({ uuid, err })
          })
          .on('finish', () => updateChunkMeta(meta))
      } else {
        updateChunkMeta(meta)
      }

    }

    function updateChunkMeta (meta: ChunkMeta) {
      meta.cur++

      if (meta.cur >= meta.total) {
        meta.done = true
        store.set(uuid, meta)

        return res.json({ uuid, status: 'done' })
      } else {
        return res.status(202).json({ uuid, status: 'pending', target: `${req.baseUrl}/upload/${uuid}/${meta.cur}` })
      }
    }
  })

  router.post('/upload_end', requiredFieldsGuardFactory(['uuid']), chunkMetaGuard, (req: DnuRequest, res, next) => {
    const { uuid } = req.body
    const meta = req.meta as ChunkMeta

    // 校验文件有效性
    if (!validateChunks(uuid, meta, _chunksFolder)) {
      return res.status(400).json({ uuid, err: 'incomplete' })
    }

    const rs = concatChunks(uuid, meta, _chunksFolder)
    const ws = fs.createWriteStream(path.resolve(_assetsFolder, meta.filename))

    rs.pipe(ws)
      .on('error', err => {
        if (err) return res.status(500).json({ uuid, err })
      })
      .on('finish', () => {
        clearChunks(uuid, meta, _chunksFolder)
        return res.json({ uuid, msg: 'complete' })
      })
  })

  router.post('/upload_abort', requiredFieldsGuardFactory(['uuid']), chunkMetaGuard, (req: DnuRequest, res, next) => {
    const { uuid } = req.body
    const meta = req.meta as ChunkMeta

    store.delete(uuid)
    clearChunks(uuid, meta, _chunksFolder)

    return res.json({ uuid, msg: 'aborted' })
  })

  return router
}
