import { assert, assertEquals } from '../deps/asserts.ts'
import { psychDSContext } from './context.ts'
import { walkFileTree } from './walk.ts'
import { DatasetIssues } from '../issues/datasetIssues.ts'
import { resolve } from "../deps/path.ts";
import { readFileTree } from "../files/deno.ts";

const PATH = 'test_data/valid_datasets/bfi-dataset'
const absolutePath = resolve(PATH)
const fileTree = await readFileTree(absolutePath)

Deno.test('file tree walking', async (t) => {
  await t.step('visits each file and creates a BIDSContext', async () => {
    const issues = new DatasetIssues()
    for await (const context of walkFileTree(fileTree, issues)) {
      assert(
        context instanceof psychDSContext,
        'walk file tree did not return a BIDSContext',
      )
    }
  })
  await t.step('visits every file expected', async () => {
    const issues = new DatasetIssues()
    let accumulator = 0
    for await (const context of walkFileTree(fileTree, issues)) {
      assert(
        context instanceof psychDSContext,
        'walk file tree did not return a BIDSContext',
      )
      accumulator = accumulator + 1
    }
    assertEquals(
      accumulator,
      12
    )
  })
})