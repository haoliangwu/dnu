import { V4MAPPED } from 'dns'
import { ChunkMeta } from '@/index'

const store: Map<string, ChunkMeta> = new Map<string, ChunkMeta>()

const memoryStore = {
  get (uuid: string): ChunkMeta | undefined {
    return store.get(uuid)
  },

  set (uuid: string, meta: ChunkMeta): typeof store {
    return store.set(uuid, meta)
  },

  delete (uuid: string): boolean {
    return store.delete(uuid)
  },

  exist (uuid: string): boolean {
    return memoryStore.isChunkMeta(memoryStore.get(uuid)) ? true : false
  },

  isChunkMeta (o: any): o is ChunkMeta {
    return o ? 'cur' in o && 'total' in o : false
  }
}

export default memoryStore
