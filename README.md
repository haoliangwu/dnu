## Dnu
Simple multipart **d**ownloading a**n**d **u**ploading suites in nodejs. 

> Just for learning purpose. Dont use it in production environment although it contains several unit-test cases.

## Todos
* [x] middlewares
  * [x] express
  * [x] koa
* [x] client library
  * [x] base impl
  * [x] uploading lifecycle hooks
* [x] unit-tests
  * [x] express-middleware
  * [x] koa-middleware 
  * [x] sync/async store
  * [x] client
* [x] uploading
  * [x] serial uploading
  * [x] parallel uploading
  * [x] second pass
* [ ] downloading
  * [ ] break-point resume
* [x] examples

## How to use

The module exports two route factory functions. Just use the route instance as standard express or koa router. The module also provide a simple client library.

### ``routerFactory(options: DnuRouterOptions)``
create an express or koa router instance with options.

* ``store``: persistence layer of chunk meta info
* ``chunkSize``: the limit of chunk size
* ``chunkFolder``: the target folder of chunks
* ``assetsFolder``: the target folder of assets
* ``secondPass``: if the server support secondPass feature
* ``onUploaded``: event hook when asset was uploaded successfully

you could also set other options that provided to ``express.Router()`` and ``koa-router``.

### ``DnuClient(options: DnuClientOptions)``
create a client instance

* ``chunkSize``: the size of chunk to split the asset
* ``fetch``: request instance, default is ``window.fetch``
* ``uuid``: the uuid factory for identifying the asset and its chunks, normally it should be ``md5`` of asset content.
* ``host``: the server host
* ``prefix``: the api endpoint prefix, default is ``/dnu``
* ``onSecondPass``: event hook when asset was secondPassed.
* ``onChunkUploaded``: event hook when chunk was uploaded.
* ``onStart``: lifecycle when uploading task started.
* ``onSuccess``: lifecycle when uploading task succeed.
* ``onError``: lifecycle when uploading task stopped due to error.
* ``onEnd``: lifecycle when uploading task ended(succeed or happen error).

The work example code please refer to [/examples](https://github.com/haoliangwu/dnu/tree/master/examples) folder.

#### ``DnuClient.upload(filename: string, ab: ArrayBuffer, options: UploadOptions)``
* ``filename``: the name of asset
* ``ab``: the ``ArrayBuffer`` of asset
* ``options``
  * ``override``: if reset uploading task with same uuid
  * ``concurrency``: the max limit of uploading tasks in parellel mode

### ``DnuStore``
the abstract class of chunk meta info persistence layer, as follow:

```
export abstract class DnuStore<M = ChunkMeta> {
  abstract get (uuid: string): M | undefined | PromiseLike<M | undefined>
  abstract set (uuid: string, meta: M): any
  abstract delete (uuid: string): boolean | PromiseLike<boolean>
  abstract exist (uuid: string): boolean | PromiseLike<boolean>

  isChunkMeta (meta: any): boolean | PromiseLike<boolean> {
    return meta ? 'cur' in meta && 'total' in meta : false
  }
}
```

the default is [``memory store``](https://github.com/haoliangwu/dnu/blob/master/src/store/memory.ts). It is easy to implement an async type store, refer to [``json store``](https://github.com/haoliangwu/dnu/blob/master/src/store/json.ts). Or use other store module as it adjusts to ``DnuStore`` abstract class.

### ``ChunkMeta``
the meta info of chunk

* ``cur``: in serial mode, it indicates to the index of current uploading task, in parellel mode, it refers to total tasks that had done.
* ``total``: the total number of chunks
* ``filename``: the filename fo asset
* ``done``: if current asset has been uploaded
* ``serial``: upload mode, true is serial mode, false is parellel mode

## Development

Refer to ``maidfile.md`` or use ``maid help``.