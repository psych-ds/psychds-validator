import { assert } from '../deps/asserts.ts'
import { psychDSFileDeno } from "../files/deno.ts";
import { FileIgnoreRules } from "../files/ignore.ts";
import { readElements } from './elements.ts'

const PATH = 'test_data/valid_datasets/bfi-dataset'
const ignore = new FileIgnoreRules([])

Deno.test('test readElementss', async (t) => {
  await t.step('has Elements', () => {
    const fileName = '/data/raw_data/study-bfi_data.csv'
    const file = new psychDSFileDeno(PATH, fileName, ignore)
    const context = readElements(file.name)
    assert(context.suffix === 'data', 'failed to match suffix')
    assert(context.extension === '.csv', 'failed to match extension')
  })
  
})
