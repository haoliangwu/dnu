import DnuClient from '../lib/client'
const $fileInput: HTMLInputElement = document.querySelector('#fileInput')

const client = new DnuClient({
  chunkSize: 1024 * 1024 * 1,
  prefix: '/dnu',
  fetch: window.fetch.bind(window),
  host: 'http://127.0.0.1:3000'
})

$fileInput.addEventListener('change', () => {
  const file = $fileInput.files[0]

  const fileReader = new FileReader()

  fileReader.addEventListener('load', () => {
    client.upload(file.name, fileReader.result)
  })

  fileReader.readAsArrayBuffer(file)
})
