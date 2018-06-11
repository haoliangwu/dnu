function guid (): string {
  function s4 () {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1)
  }
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4()
}

function noop () { } // tslint:disable-line:no-empty

export interface DnuClientOptions {
  chunkSize?: number
  fetch?: any,
  uuid?: () => string,
  host?: string
  prefix?: string
  // event hooks
  onSecondPass?: Function
  onChunkUploaded?: Function
  // lifecycle hooks
  onStart?: Function
  onSuccess?: Function
  onEnd?: Function
  onError?: Function
}

export default class DnuClient {
  private chunkSize: number
  private uuid: () => string
  private host: string
  private prefix: string
  private fetch: typeof fetch
  private onSecondPass: Function
  private onChunkUploaded: Function
  private onStart: Function
  private onSuccess: Function
  private onEnd: Function
  private onError: Function

  private uploading = false
  private meta = {
    cur: 0,
    filename: '',
    total: 0
  }

  constructor (
    private options: DnuClientOptions // tslint:disable-line:no-unused-variable
  ) {
    this.chunkSize = options.chunkSize || 1024 * 1024 * 5
    this.fetch = options.fetch || fetch
    this.uuid = options.uuid || guid
    this.host = options.host || 'http://127.0.0.1:3000'
    this.prefix = options.prefix || 'dnu'
    this.onSecondPass = options.onSecondPass || noop
    this.onChunkUploaded = options.onChunkUploaded || noop
    this.onStart = options.onStart || noop
    this.onSuccess = options.onSuccess || noop
    this.onEnd = options.onEnd || noop
    this.onError = options.onError || noop
  }

  upload (filename: string, ab: ArrayBuffer, override: boolean = false) {
    if (this.uploading) throw new Error('only one uploading task support')

    this.uploading = true

    const uuid = this.uuid()

    this.meta.filename = filename
    this.meta.total = this.countChunks(ab)

    const startPromise = override ? this.reset(uuid).then(res => this.start(uuid)) : this.start(uuid)

    return startPromise
      .then(res => {
        if (res.status === 'exist') {
          // 当前资源已存在上传副本
          this.onSecondPass(res.uuid)
          this.onEnd()
        } else {
          return this.chunk(res.target, ab).then(() => this.end(uuid))
        }
      })
      .catch(err => {
        if (err) {
          this.onError(err)
          this.onEnd(err)
        }
        this.uploading = false
      })
  }

  countChunks (ab: ArrayBuffer): number {
    return Math.ceil(ab.byteLength / this.chunkSize)
  }

  sliceChunk (cur: number, ab: ArrayBuffer): ArrayBuffer {
    return ab.slice(cur * this.chunkSize, (cur + 1) * this.chunkSize)
  }

  private reset (uuid: string): Promise<any> {
    const payload = {
      uuid
    }

    return this.fetch(`${this.host}${this.prefix}/upload_abort`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    }).then(res => res.json())
  }

  private start (uuid: string): Promise<any> {
    if (!this.meta) throw new Error('invalid chunkMeta')

    const payload = {
      uuid,
      total: this.meta.total,
      filename: this.meta.filename
    }

    return this.fetch(`${this.host}${this.prefix}/upload_start`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    }).then(res => {
      this.onStart(this.meta)

      return res.json()
    })
  }

  private chunk (target: string, ab: ArrayBuffer): any | Promise<any> {
    const { cur } = this.meta
    const chunk = this.sliceChunk(cur, ab)

    return this.fetch(`${this.host}${target}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream'
      },
      body: chunk
    }).then(res => res.json())
      .then(res => {
        this.onChunkUploaded(this.meta)

        this.meta.cur++

        if (res.status === 'done') {
          return res
        } else if (res.status === 'pending') {
          return this.chunk(res.target, ab)
        }
      })
  }

  private end (uuid: string): Promise<any> {
    const payload = { uuid }

    return this.fetch(`${this.host}${this.prefix}/upload_end`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    }).then(res => {
      this.uploading = false
      this.onSuccess(this.meta)
      this.onEnd()

      return res.json()
    })
  }
}
