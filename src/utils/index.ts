import fs from 'fs'
import path from 'path'
import StreamsConcat from 'stream-concat'
import { ChunkMeta } from '../index'
import { Transform } from 'stream'

export function initFolders (folders: string[] = []): void {
  folders.forEach(folder => {
    fs.exists(folder, (exists) => {
      if (exists) return
      else fs.mkdirSync(folder)
    })
  })
}

export function validateChunks (uuid: string, meta: ChunkMeta, baseFolder: string = './'): boolean {
  for (let i = 0; i < meta.total; i++) {
    if (fs.existsSync(path.resolve(baseFolder, `${uuid}-${i}`))) {
      continue
    }
    return false
  }

  return true
}

export function concatChunks (uuid: string, meta: ChunkMeta, baseFolder: string = './'): Transform {
  const chunkStreams: fs.ReadStream[] = []

  for (let i = 0; i < meta.total; i++) {
    chunkStreams.push(fs.createReadStream(path.resolve(baseFolder, `${uuid}-${i}`)))
  }

  return new StreamsConcat(chunkStreams)
}

export function clearChunks (uuid: string, meta: ChunkMeta, baseFolder: string = './') {
  for (let i = 0; i < meta.total; i++) {
    fs.unlink(path.resolve(baseFolder, `${uuid}-${i}`), (err) => {
      if (err) return
    })
  }
}
