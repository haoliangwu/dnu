import { ChunkMeta, DnuStore } from '@/index'

export default class MemoryStore extends DnuStore<Map<string, ChunkMeta>> {
  private store: Map<string, ChunkMeta>

  constructor (
  ) {
    super()
    this.store = new Map<string, ChunkMeta>()
  }

  get (uuid: string) {
    return this.store.get(uuid)
  }

  set (uuid: string, meta: ChunkMeta) {
    return this.store.set(uuid, meta)
  }

  delete (uuid: string): boolean {
    return this.store.delete(uuid)
  }

  exist (uuid: string): boolean {
    return this.isChunkMeta(this.get(uuid)) ? true : false
  }
}
