import path from 'path'
import fs from 'fs'
import mkdirp from 'mkdirp'

import { ChunkMeta, DnuStore } from '@/index'

export interface JsonStoreConfig {
  [uuid: string]: ChunkMeta
}

export default class JsonStore extends DnuStore {
  get store (): Promise<JsonStoreConfig> {
    return new Promise((resolve, reject) => {
      fs.readFile(this.configPath, (err, data) => {
        if (err) return reject(err)
        resolve(this.parse(data.toString()))
      })
    })
  }

  get configPath (): string {
    return path.resolve(this._path, this._name)
  }

  constructor (
    private _path: string,
    private _name: string = 'store.json',
    private initConfg: JsonStoreConfig = {}
  ) {
    super()
    this._path = _path || process.cwd()
    this.init()
  }

  get (uuid: string): ChunkMeta | undefined | Promise<ChunkMeta | undefined> {
    return this.store.then(config => {
      const meta = config[uuid]

      return meta ? meta : undefined
    })
  }

  set (uuid: string, meta: ChunkMeta): PromiseLike<JsonStore> {
    return this.store.then(config => {
      config[uuid] = meta
      this.write(config)
      return this
    })
  }

  delete (uuid: string): boolean | Promise<boolean> {
    return this.store.then(config => {
      delete config[uuid]
      try {
        this.write(config)
        return true
      } catch (error) {
        return false
      }
    })
  }

  exist (uuid: string): boolean | Promise<boolean> {
    return this.store.then(config => !!config[uuid])
  }

  private init () {
    mkdirp.sync(this._path)

    if (fs.existsSync(this.configPath)) {
      fs.unlinkSync(this.configPath)
    }

    this.write(this.initConfg)
  }

  private parse (str: any): any {
    return JSON.parse(str)
  }

  private serilize (obj: any): string {
    return JSON.stringify(obj)
  }

  private write (str: object) {
    return fs.writeFileSync(this.configPath, this.serilize(str))
  }
}
