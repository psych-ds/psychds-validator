import { assertEquals, assertRejects } from '../deps/asserts.ts'
import { readAll, readerFromStreamReader } from '../deps/stream.ts'
import path from 'node:path';
import { psychDSFileDeno, UnicodeDecodeError, readFileTree } from './deno.ts'
import { requestReadPermission } from '../setup/requestPermissions.ts'
import { FileIgnoreRules } from './ignore.ts'

await requestReadPermission()

// Use this file for testing file behavior
const testUrl = import.meta.url
const testPath = testUrl.slice('file://'.length)
const testDir = path.dirname(testPath)
const testFilename = path.basename(testPath)
const ignore = new FileIgnoreRules([])

Deno.test('Deno implementation of BIDSFile', async (t) => {
  await t.step('implements basic file properties', () => {
    const file = new psychDSFileDeno(testDir, testFilename, ignore)
    assertEquals(path.join(testDir, file.path), testPath)
  })
  await t.step('implements correct file size', async () => {
    const { size } = await Deno.stat(testPath)
    const file = new psychDSFileDeno(testDir, testFilename, ignore)
    assertEquals(await file.size, size)
  })
  await t.step('can be read as ReadableStream', async () => {
    const file = new psychDSFileDeno(testDir, testFilename, ignore)
    const stream = file.stream
    const streamReader = stream.getReader()
    const denoReader = readerFromStreamReader(streamReader)
    const fileBuffer = await readAll(denoReader)
    assertEquals(await file.size, fileBuffer.length)
  })
  await t.step('can be read with .text() method', async () => {
    const file = new psychDSFileDeno(testDir, testFilename, ignore)
    const text = await file.text()
    assertEquals(await file.size, text.length)
  })
  await t.step(
    'throws UnicodeDecodeError when reading a UTF-16 file with text() method',
    async () => {
      // BOM is invalid in JSON but shows up often from certain tools, so abstract handling it
      const bomDir = path.join(testPath, '..', '..', 'tests')
      const bomFilename = 'bom-utf16.csv'
      const file = new psychDSFileDeno(bomDir, bomFilename, ignore)
      await assertRejects(async () => await file.text(), UnicodeDecodeError)
    },
  )
  await t.step(
    'strips BOM characters when reading UTF-8 via .text()',
    async () => {
      // BOM is invalid in JSON but shows up often from certain tools, so abstract handling it
      const bomDir = path.join(testPath, '..', '..', 'tests')
      const bomFilename = 'bom-utf8.json'
      const file = new psychDSFileDeno(bomDir, bomFilename, ignore)
      const text = await file.text()
      assertEquals(text, '{\n  "example": "JSON for test suite"\n}\n')
    },
  )
})

Deno.test('Test readFileTree', async (t) => {
    await t.step('fileTree exists', async() => {
      const fileTree = await readFileTree(testDir)
      assertEquals(fileTree.files.length,6)
    })

  })