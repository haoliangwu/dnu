// refer to nodejs-pattern

export default class TaskQueue {
  get running () {
    return this._running
  }

  private _running = 0
  private queue: Promise<any>[] = []

  constructor (
    private concurrency: number,
    private onDone?: Function
  ) { }

  push (task: Promise<any>) {
    this.queue.push(task)
    this.next()
  }

  next () {
    if (this._running === 0 && this.queue.length === 0) {
      return this.onDone && this.onDone()
    }

    while (this._running < this.concurrency && this.queue.length) {
      const task = this.queue.shift()

      Promise.resolve(task)
        .then(() => {
          this._running--
          this.next()
        })

      this._running++
    }
  }
}
