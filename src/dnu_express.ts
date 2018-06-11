import fs from 'fs'
import path from 'path'
import { isUndefined } from 'util'

import { RequestHandler, Router, RouterOptions, Request } from 'express'
import bodyparser, { json } from 'body-parser'
import from2 from 'from2'

import { ChunkMeta, DnuStore, DnuRouterOptions } from '@/index'
import { validateChunks, concatChunks, clearChunks, initFolders } from '@/utils'
import MemoryStore from '@/store/memory'
import { DEFAULT_TEMP_FOLDER, DEFAULT_CHECK_SIZE } from '@/constants'

// typings
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

const chunkMetaGuard: (store: DnuStore<any>) => RequestHandler = (store) => {
  return function (req: DnuRequest, res, next) {
    const uuid = req.params.uuid || req.body.uuid

    if (!store.exist(uuid)) {
      return res.status(404).json({ uuid, err: 'unexist' })
    }

    Promise.resolve(store.get(uuid))
      .then(meta => {
        if (!store.isChunkMeta(meta)) {
          return res.status(409).json({ uuid, err: 'conflict' })
        }

        req.meta = meta

        next()
      })
  }
}

// router factory
export default function routerFactory (options?: DnuRouterOptions & RouterOptions) {
  let _chunksFolder = DEFAULT_TEMP_FOLDER
  let _assetsFolder = DEFAULT_TEMP_FOLDER
  let _chunkSize = DEFAULT_CHECK_SIZE
  let _store: DnuStore<any> = new MemoryStore()

  if (options) {
    const { chunksFolder, assetsFolder, store, chunkSize } = options

    _chunksFolder = chunksFolder || _chunksFolder
    _chunkSize = chunkSize || _chunkSize
    _assetsFolder = assetsFolder || _assetsFolder
    _store = store || _store
  }

  initFolders([_chunksFolder, _assetsFolder])

  const router: Router = Router(options)

  router.use(bodyparser.json())

  router.get('/', (req, res, next) => {
    res.send('dnu index')
  })

  // 查询文件当前上传状态
  router.get('/status/:uuid', chunkMetaGuard(_store), (req: DnuRequest, res, next) => {
    const { uuid } = req.params
    const meta = req.meta as ChunkMeta

    if (meta.done) {
      return res.json({ uuid, status: 'done' })
    } else {
      return res.status(302).json({ uuid, status: 'pending' })
    }
  })

  router.post('/upload_start', requiredFieldsGuardFactory(['uuid', 'total', 'filename']), (req, res, next) => {
    const { uuid, total, filename } = req.body

    Promise.resolve(_store.set(uuid, {
      cur: 0, total, done: false, filename
    })).then(() => {
      res.status(201).json({
        uuid,
        status: 'start',
        target: `${req.baseUrl}/upload/${uuid}/0`
      })
    })
  })

  router.post('/upload/:uuid/:idx', chunkMetaGuard(_store), bodyparser.raw({
    limit: _chunkSize
  }), (req: DnuRequest, res, next) => {
    const { uuid, idx } = req.params
    const meta = req.meta as ChunkMeta
    const _idx = Number.parseInt(idx)

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
      res.status(400)
      if (_idx < meta.cur) {
        return res.json({ uuid, err: 'duplicated' })
      } else {
        return res.json({ uuid, err: 'inaccessible' })
      }
    }

    if (meta.done) {
      return res.json({ uuid, status: 'done' })
    } else {
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
      let response = {}

      meta.cur++

      if (meta.cur >= meta.total) {
        meta.done = true
        response = { uuid, status: 'done' }
      } else {
        res.status(202)
        response = { uuid, status: 'pending', target: `${req.baseUrl}/upload/${uuid}/${meta.cur}` }
      }

      return Promise.resolve(_store.set(uuid, meta)).then(() => {
        res.json(response)
      })
    }
  })

  router.post('/upload_end', requiredFieldsGuardFactory(['uuid']), chunkMetaGuard(_store), (req: DnuRequest, res, next) => {
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

  router.post('/upload_abort', requiredFieldsGuardFactory(['uuid']), chunkMetaGuard(_store), (req: DnuRequest, res, next) => {
    const { uuid } = req.body
    const meta = req.meta as ChunkMeta

    Promise.resolve(_store.delete(uuid))
      .then(success => {
        if (success) {
          clearChunks(uuid, meta, _chunksFolder)

          return res.json({ uuid, msg: 'aborted' })
        } else {
          return res.json({ uuid, msg: 'failed' })
        }
      })
  })

  return router
}
