import path from 'path'
import fs from 'fs'

import { ChunkMeta, DnuStore } from '@/index'

export default class JsonStore extends DnuStore<Object> {
  constructor (
    private _path: string = '.'
  ) {
    super()
    this._path = path.resolve(process.cwd(), _path)
  }

  get (uuid: string): ChunkMeta | Promise<ChunkMeta> | undefined {
    throw new Error('Method not implemented.')
  }

  set (uuid: string, meta: ChunkMeta): Object {
    throw new Error('Method not implemented.')
  }

  delete (uuid: string): boolean | Promise<boolean> {
    throw new Error('Method not implemented.')
  }

  exist (uuid: string): boolean | Promise<boolean> {
    throw new Error('Method not implemented.')
  }

  private init () {
    if (fs.existsSync(this._path)) fs.unlinkSync(this._path)

    fs.closeSync(fs.openSync(this._path, 'w'))
  }
}
