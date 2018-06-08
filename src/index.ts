export interface ChunkMeta {
  cur: number
  total: number
  done: boolean
  filename: string
}

export abstract class DnuStore<S, M = ChunkMeta> {
  abstract get (uuid: string): M | undefined | PromiseLike<M | undefined>
  abstract set (uuid: string, meta: M): S
  abstract delete (uuid: string): boolean | PromiseLike<boolean>
  abstract exist (uuid: string): boolean | PromiseLike<boolean>

  isChunkMeta (meta: any): boolean | PromiseLike<boolean> {
    return meta ? 'cur' in meta && 'total' in meta : false
  }
}

export { default as expressRouter } from './express'

export * from './express'
