import { GenericSchema } from '../types/schema.ts'
import { assertEquals } from '../deps/asserts.ts'
import { psychDSContext } from '../schema/context.ts'
import { extensionMismatch, checkMissingRules, keywordCheck } from './filenameValidate.ts'
import { psychDSFileDeno, readFileTree } from '../files/deno.ts'
import { DatasetIssues } from '../issues/datasetIssues.ts'
import { FileIgnoreRules } from '../files/ignore.ts'
import { loadSchema } from '../setup/loadSchema.ts'

Deno.test({
    name:'test filenameValidate.ts', 
    sanitizeResources: false,
    fn: async (t) => {
      // Move initial declarations inside test function to avoid top-level await
      const PATH = 'test_data/valid_datasets/bfi-dataset'
      const schema = (await loadSchema()) as unknown as GenericSchema
      const fileTree = await readFileTree(PATH)
      const issues = new DatasetIssues(schema)
      const ignore = new FileIgnoreRules([])

      await t.step('extensions match', async () => {
        const fileName = 'dataset_description.json'
        const file = new psychDSFileDeno(PATH,fileName, ignore)
        const context = new psychDSContext(fileTree, file, issues)
        await extensionMismatch('rules.files.common.core.dataset_description',schema,context)
        assertEquals(
          context.issues.has('EXTENSION_MISMATCH'),
          false,
        )
      })
    
      await t.step('extensions mismatch', async () => {
          const fileName = 'dataset_description.json'
          const file = new psychDSFileDeno(PATH,fileName, ignore)
          const context = new psychDSContext(fileTree, file, issues)
          await extensionMismatch('rules.files.common.core.README',schema,context)
          assertEquals(
            context.issues.has('EXTENSION_MISMATCH'),
            true
          )
        })
      await t.step('rule satisfied',  () => {
          const fileName = 'dataset_description.json'
          const file = new psychDSFileDeno(PATH,fileName, ignore)
          const context = new psychDSContext(fileTree, file, issues)
          const rulesRecord: Record<string,boolean> = {}
          rulesRecord['rules.files.common.core.dataset_description'] = true
          checkMissingRules(schema,rulesRecord,context.issues)
          assertEquals(
              context.issues.has('MISSING_DATASET_DESCRIPTION'),
              false
              )
      })

      await t.step('rule not satisfied',  () => {
          const fileName = 'dataset_description.json'
          const file = new psychDSFileDeno(PATH,fileName, ignore)
          const context = new psychDSContext(fileTree, file, issues)
          const rulesRecord: Record<string,boolean> = {}
          rulesRecord['rules.files.common.core.dataset_description'] = false
          checkMissingRules(schema,rulesRecord,context.issues)
          assertEquals(
              context.issues.has('MISSING_DATASET_DESCRIPTION'),
              true
          )
      })
      // Added all test steps to main Deno test
      await t.step('rule satisfied',  () => {
        const fileName = 'study-bfi_data.csv'
        const file = new psychDSFileDeno(`${PATH}/data/raw_data`,fileName, ignore)
        const context = new psychDSContext(fileTree, file, issues)
        keywordCheck('rules.files.tabular_data.data.Datafile',schema,context)
        assertEquals(
            context.issues.has('KEYWORD_FORMATTING_ERROR'),
            false
            )
      })
    
      await t.step('formatting broken',  () => {
        const fileName = 'study_data.csv'
        const file = new psychDSFileDeno(`test_data/testfiles/`,fileName, ignore)
        const context = new psychDSContext(fileTree, file, issues)
        keywordCheck('rules.files.tabular_data.data.Datafile',schema,context)
        assertEquals(
            context.issues.has('KEYWORD_FORMATTING_ERROR'),
            true
            )
      })
    
      await t.step('rule not satisfied',  () => {
          const fileName = 'fake-v1_data.csv'
          const file = new psychDSFileDeno(`test_data/testfiles/`,fileName, ignore)
          const context = new psychDSContext(fileTree, file, issues)
          keywordCheck('rules.files.tabular_data.data.Datafile',schema,context)
          assertEquals(
              context.issues.has('UNOFFICIAL_KEYWORD_WARNING'),
              true
          )
      })
    }
  
  })