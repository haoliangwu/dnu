declare module 'stream-concat' {
  import { Transform, Readable, TransformOptions } from "stream";

  export interface StreamConcatOptions extends TransformOptions {
    advanceOnClose: boolean
  }

  export default class StreamsConcat extends Transform{
    constructor (streams: Readable[], options?: StreamConcatOptions)

    addStream(stream: Readable): void
  }
}