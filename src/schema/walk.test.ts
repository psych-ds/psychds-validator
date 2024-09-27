import { assert, assertEquals } from '../deps/asserts.ts'
import { psychDSContext } from './context.ts'
import { walkFileTree } from './walk.ts'
import { DatasetIssues } from '../issues/datasetIssues.ts'
import path from 'node:path';
import { readFileTree } from "../files/deno.ts";

Deno.test({
  name:'test walk.ts', 
  sanitizeResources: false,
  fn: async (t) => {
    // Move initial declarations inside test function to avoid top-level await
    const PATH = 'test_data/valid_datasets/bfi-dataset'
    const absolutePath = path.resolve(PATH)
    const fileTree = await readFileTree(absolutePath)

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
  }
})