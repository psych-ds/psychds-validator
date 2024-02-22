import { assertEquals } from '../deps/asserts.ts'
import { psychDSContext } from '../schema/context.ts'
import {
  _findRuleMatches,
  findFileRules
} from './filenameIdentify.ts'
import { psychDSFileDeno, readFileTree } from '../files/deno.ts'
import { FileTree } from '../types/filetree.ts'
import { DatasetIssues } from '../issues/datasetIssues.ts'
import { FileIgnoreRules } from '../files/ignore.ts'
import { loadSchema } from '../setup/loadSchema.ts'
import { validate } from './psychds.ts';
import { ValidatorOptions } from '../setup/options.ts';
import { resolve } from '../deps/path.ts';

const PATH = 'test_data/valid_datasets/bfi-dataset'
const schema = await loadSchema()
const fileTree = new FileTree(PATH, '/')
const issues = new DatasetIssues()
const ignore = new FileIgnoreRules([])

const node = {
  stem: 'dataset_description',
  arbitraryNesting: true,
  baseDir: "/",
  extensions: [".json"]
}

const recurseNode = {
  recurse: {
    baseDir: "data",
    arbitraryNesting: true,
    extensions: [".csv"],
    suffix: "data"
  },
}

const schemaPath = 'test.schema.path'

Deno.test('test _findRuleMatches', async (t) => {
  // base case
  await t.step('Rule stem matches',  () => {
    const fileName = 'dataset_description.json'
    const file = new psychDSFileDeno(PATH, fileName, ignore)
    const context = new psychDSContext(fileTree, file, issues)
    _findRuleMatches(node, schemaPath, context)
    assertEquals(context.filenameRules[0], schemaPath)
  })

  //recurse case
  await t.step(
    'Non-terminal schema node, should recurse then match',
     () => {
      const fileName = 'data/raw_data/study-bfi_data.csv'
      const file = new psychDSFileDeno(PATH, fileName, ignore)
      const context = new psychDSContext(fileTree, file, issues)
      context.baseDir = 'data'
      _findRuleMatches(recurseNode, schemaPath, context)
      assertEquals(context.filenameRules[0], `${schemaPath}.recurse`)
    },
  )
  await t.step(
    'recurse failure without arbitraryNesting',
     () => {
      const fileName = 'data/raw_data/study-bfi_data.csv'
      const file = new psychDSFileDeno(PATH, fileName, ignore)
      const context = new psychDSContext(fileTree, file, issues)
      context.baseDir = 'data'
      recurseNode.recurse.arbitraryNesting = false
      _findRuleMatches(recurseNode, schemaPath, context)
      assertEquals(context.filenameRules, [])
    },
  )
})

Deno.test('test findFileRules', async (t) => {
    await t.step('Rules Recognized', async () => {
      const rulesRecord: Record<string,boolean> = {}
      await findFileRules(schema, rulesRecord)
      assertEquals(Object.keys(rulesRecord).length, 11)
    })
  })

  Deno.test('test checkDirRules', async (t) => {
    await t.step('data directory exists', async () => {
      const rulesRecord: Record<string,boolean> = {}
      await findFileRules(schema, rulesRecord)
      assertEquals(Object.keys(rulesRecord).length, 11)
    })
  })
  Deno.test({
    name:'misplaced metadata', 
    sanitizeResources: false,
    fn: async (t) => {
      await t.step('misplaced metadata', async () => {
        const absolutePath = resolve('test_data/valid_datasets/nih-reviews')
        const tree = await readFileTree(absolutePath)
        const schemaResult = await validate(tree, {} as ValidatorOptions)
        assertEquals(schemaResult.issues.has('WRONG_METADATA_LOCATION'),true)
      })
    }
  })
