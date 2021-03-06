import fs from 'fs'
import path from 'path'
import { isUndefined } from 'util'

import Router, { IRouterOptions, IMiddleware, IRouterContext } from 'koa-router'
import from2 from 'from2'
import bodyparser from 'koa-bodyparser'
import rawBody from 'raw-body'

import { DnuRouterOptions, DnuStore, ChunkMeta } from '@/index'
import { validateChunks, concatChunks, clearChunks, initFolders } from '@/utils'
import MemoryStore from '@/store/memory'
import { DEFAULT_TEMP_FOLDER, DEFAULT_CHECK_SIZE, DEFAULT_ROUTE_PREFIX } from '@/constants'

// typings augment
export interface DnuRouterOptions {
  prefix: string
}

interface DnuKoaContext extends IRouterContext {
  meta?: ChunkMeta,
  rawBody?: Buffer
}

// middlewares
const requiredFieldsGuardFactory: (fields: string[]) => IMiddleware = (fields: string[]) => {
  return async function (ctx: DnuKoaContext, next) {
    const pred = (field: string) => isUndefined(ctx.request.body[field])

    if (fields.some(pred)) {
      ctx.status = 400
      ctx.body = { msg: 'lack of required fields' }
      return
    }

    await next()
  }
}

const chunkMetaGuard: (store: DnuStore<any>) => IMiddleware = (store) => {
  return async function (ctx: DnuKoaContext, next) {
    const uuid = ctx.params.uuid || ctx.request.body.uuid

    if (!store.exist(uuid)) {
      ctx.status = 404
      ctx.body = { uuid, err: 'unexist' }

      return
    }

    const meta = await Promise.resolve(store.get(uuid))

    if (!store.isChunkMeta(meta)) {
      ctx.status = 409
      ctx.body = { uuid, err: 'conflict' }
      return
    }

    ctx.meta = meta

    await next()
  }
}

const chunkIdxGuard: () => IMiddleware = () => {
  return async function (ctx: DnuKoaContext, next) {
    const { uuid, idx } = ctx.params
    const meta = ctx.meta as ChunkMeta
    const _idx = Number.parseInt(idx)
    const mode = ctx.query.mode || 'serial'

    if (Number.isNaN(_idx)) {
      ctx.status = 400
      ctx.body = { uuid, err: 'invalid idx' }
      return
    }

    if (_idx > meta.total || _idx < 0) {
      ctx.status = 400
      ctx.body = { uuid, err: 'idx out-range' }
      return
    }

    switch (mode) {
      case 'serial':
        if (_idx !== meta.cur) {
          ctx.status = 400
          if (_idx < meta.cur) {
            ctx.body = { uuid, err: 'duplicated' }
          } else {
            ctx.body = { uuid, err: 'inaccessible' }
          }
          return
        }

        meta.serial = true
        break
      case 'parellel':
        if (meta.cur > meta.total) {
          ctx.status = 400
          ctx.body = { uuid, err: 'beyond max limit times' }
        }
        meta.serial = false
        break
      default:
        ctx.status = 400
        ctx.body = { uuid, err: 'unsupport mode' }
        return
    }

    ctx.meta = meta

    await next()
  }
}

export default function routerFactory (options: DnuRouterOptions & IRouterOptions = {}) {
  let _chunksFolder = DEFAULT_TEMP_FOLDER
  let _assetsFolder = DEFAULT_TEMP_FOLDER
  let _chunkSize = DEFAULT_CHECK_SIZE
  let _store: DnuStore<any> = new MemoryStore()
  let _prefix = DEFAULT_ROUTE_PREFIX
  let _secondPass = false

  if (options) {
    const { chunksFolder, assetsFolder, store, chunkSize, prefix, secondPass } = options

    _chunksFolder = chunksFolder || _chunksFolder
    _chunkSize = chunkSize || _chunkSize
    _assetsFolder = assetsFolder || _assetsFolder
    _store = store || _store
    _prefix = prefix || _prefix
    _secondPass = !!secondPass
  }

  initFolders([_chunksFolder, _assetsFolder])

  const router: Router = new Router(options)

  router.use(bodyparser())

  router.get('/', (ctx, next) => {
    ctx.response.body = 'dnu index'
  })

  // 查询文件当前上传状态
  router.get('/status/:uuid', chunkMetaGuard(_store), (ctx: DnuKoaContext, next) => {
    const { uuid } = ctx.params
    const meta = ctx.meta as ChunkMeta

    if (meta.done) {
      ctx.body = { uuid, status: 'done' }
    } else {
      ctx.status = 302
      ctx.body = { uuid, status: 'pending' }
    }
  })

  router.post('/upload_start', requiredFieldsGuardFactory(['uuid', 'total', 'filename']), async (ctx: DnuKoaContext, next) => {
    const { uuid, total, filename } = ctx.request.body
    const createUploadTask = async (cur: number = 0) => {
      await _store.set(uuid, {
        cur, total, done: false, filename
      })

      ctx.status = 201
      ctx.body = {
        uuid,
        status: 'start',
        target: `${_prefix}/upload/${uuid}/${cur}`
      }
    }

    const meta: ChunkMeta = await _store.get(uuid)

    if (meta) {
      if (_secondPass && meta.done) {
        ctx.status = 302
        ctx.body = { uuid, status: 'exist' }
        return
      } else {
        await createUploadTask(meta.cur)
      }
    } else {
      await createUploadTask()
    }
  })

  router.post('/upload/:uuid/:idx', chunkMetaGuard(_store), chunkIdxGuard(), async (ctx: DnuKoaContext, next) => {
    const { uuid, idx } = ctx.params
    const meta = ctx.meta as ChunkMeta

    if (meta.done) {
      ctx.body = { uuid, status: 'done' }
      return
    } else {
      let raw = await rawBody(ctx.req, {
        limit: _chunkSize
      })

      if (Buffer.isBuffer(raw)) {
        const rs = from2((size, next) => {
          if (raw.byteLength <= 0) return next(null, null)

          const chunk = raw.slice(0, size)
          raw = raw.slice(size)

          next(null, chunk)
        })

        const chunkId = meta.serial ? meta.cur : Number.parseInt(idx)
        const ws = fs.createWriteStream(`${_chunksFolder}/${uuid}-${chunkId}`)

        await new Promise((resolve, reject) => {
          rs.pipe(ws)
            .on('error', err => {
              if (err) {
                ctx.status = 500
                ctx.body = { uuid, err }
                resolve()
              }
            })
            .on('finish', async () => {
              await updateChunkMeta()
              resolve()
            })
        })
      } else {
        await updateChunkMeta()
      }
    }

    function updateChunkMeta () {
      meta.cur++

      if (meta.cur >= meta.total) {
        meta.done = true
        ctx.body = { uuid, status: 'done' }
      } else {
        const target = meta.serial ? `${_prefix}/upload/${uuid}/${meta.cur}` : undefined
        ctx.body = { uuid, status: 'pending', target }
        ctx.status = 202
      }

      return _store.set(uuid, meta)
    }
  })

  router.post('/upload_end', requiredFieldsGuardFactory(['uuid']), chunkMetaGuard(_store), async (ctx: DnuKoaContext, next) => {
    const { uuid } = ctx.request.body
    const meta = ctx.meta as ChunkMeta

    // 校验文件有效性
    if (!validateChunks(uuid, meta, _chunksFolder)) {
      ctx.status = 400
      ctx.body = { uuid, err: 'incomplete' }
      return
    }

    const targetPath = path.resolve(_assetsFolder, meta.filename)
    const rs = concatChunks(uuid, meta, _chunksFolder)
    const ws = fs.createWriteStream(targetPath)

    await new Promise((resolve, reject) => {
      rs.pipe(ws)
      .on('error', err => {
        if (err) {
          ctx.status = 500
          ctx.body = { uuid, err }
          resolve()
        }
      })
      .on('finish', () => {
        options.onUploaded && options.onUploaded(targetPath)
        clearChunks(uuid, meta, _chunksFolder)
        ctx.body = { uuid, msg: 'complete' }
        resolve()
      })
    })
  })

  router.post('/upload_abort', requiredFieldsGuardFactory(['uuid']), chunkMetaGuard(_store), async (ctx: DnuKoaContext, next) => {
    const { uuid } = ctx.request.body
    const meta = ctx.meta as ChunkMeta

    const success = await Promise.resolve(_store.delete(uuid))

    if (success) {
      clearChunks(uuid, meta, _chunksFolder)
      ctx.body = { uuid, msg: 'aborted' }
    } else {
      ctx.body = { uuid, msg: 'failed' }
    }
  })

  return router.routes()
}
