import DnuClient from '../lib/client'
const $fileInput: HTMLInputElement = document.querySelector('#fileInput')
const $serialBtn: HTMLInputElement = document.querySelector('#serial')
const $parellelBtn: HTMLInputElement = document.querySelector('#parellel')

const client = new DnuClient({
  chunkSize: 1024 * 1024 * 1,
  prefix: '/dnu',
  fetch: window.fetch.bind(window),
  host: 'http://127.0.0.1:3001'
})

let uploadMeta = {
  name: null,
  data: null
}

function guard (cb: any) {
  if (!uploadMeta.data) return alert('select big file first')
  else cb && cb()
}

$fileInput.addEventListener('change', () => {
  const file = $fileInput.files[0]

  const fileReader = new FileReader()

  fileReader.addEventListener('load', () => {
    uploadMeta.name = file.name
    uploadMeta.data = fileReader.result
  })

  fileReader.readAsArrayBuffer(file)
})

$serialBtn.addEventListener('click', () => {
  guard(() => client.upload(uploadMeta.name, uploadMeta.data))
})

$parellelBtn.addEventListener('click', () => {
  guard(() => client.upload(uploadMeta.name, uploadMeta.data, { concurrency: 2 }))
})
