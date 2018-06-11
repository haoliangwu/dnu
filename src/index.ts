export interface ChunkMeta {
  cur: number
  total: number
  filename: string
  done: boolean
}

export abstract class DnuStore<M = ChunkMeta> {
  abstract get (uuid: string): M | undefined | PromiseLike<M | undefined>
  abstract set (uuid: string, meta: M): any
  abstract delete (uuid: string): boolean | PromiseLike<boolean>
  abstract exist (uuid: string): boolean | PromiseLike<boolean>

  isChunkMeta (meta: any): boolean | PromiseLike<boolean> {
    return meta ? 'cur' in meta && 'total' in meta : false
  }
}

export interface DnuRouterOptions {
  store?: DnuStore<any>
  chunkSize?: number
  chunksFolder?: string
  assetsFolder?: string
  secondPass?: boolean
}

export { default as expressRouter } from './dnu_express'

export { default as koaRouter } from './dnu_koa'
