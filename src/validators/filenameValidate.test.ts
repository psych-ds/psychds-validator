import { FileTree } from '../types/filetree.ts'
import { GenericSchema } from '../types/schema.ts'
import { assertEquals } from '../deps/asserts.ts'
import { psychDSContext } from '../schema/context.ts'
import { checkRules,extensionMismatch, checkMissingRules } from './filenameValidate.ts'
import { psychDSFileDeno } from '../files/deno.ts'
import { DatasetIssues } from '../issues/datasetIssues.ts'
import { FileIgnoreRules } from '../files/ignore.ts'
import { loadSchema } from '../setup/loadSchema.ts'

const PATH = 'test_data/valid_datasets/bfi-dataset'
const schema = (await loadSchema()) as unknown as GenericSchema
const fileTree = new FileTree(PATH, '/')
const issues = new DatasetIssues()
const ignore = new FileIgnoreRules([])

Deno.test('test checkRules', async (t) => {
  await t.step('One rule found', async () => {
    const fileName = 'dataset_description.json'
    const file = new psychDSFileDeno(PATH,fileName, ignore)
    const context = new psychDSContext(fileTree, file, issues)
    context.filenameRules = [...context.filenameRules,"rules.files.common.core.dataset_description"]
    await checkRules(schema,context)
  })

  await t.step('No rule found', async () => {
    const fileName = 'dataset_description.json'
    const file = new psychDSFileDeno(PATH,fileName, ignore)
    const context = new psychDSContext(fileTree, file, issues)
    await checkRules(schema,context)
  })

})

Deno.test('test extensionMismatch', async (t) => {
    await t.step('extensions match', async () => {
      const fileName = 'dataset_description.json'
      const file = new psychDSFileDeno(PATH,fileName, ignore)
      const context = new psychDSContext(fileTree, file, issues)
      await extensionMismatch('rules.files.common.core.dataset_description',schema,context)
      assertEquals(
        context.issues
          .getFileIssueKeys(context.file.path)
          .includes('EXTENSION_MISMATCH'),
        false,
      )
    })
  
    await t.step('extensions mismatch', async () => {
        const fileName = 'dataset_description.json'
        const file = new psychDSFileDeno(PATH,fileName, ignore)
        const context = new psychDSContext(fileTree, file, issues)
        await extensionMismatch('rules.files.common.core.README',schema,context)
        assertEquals(
          context.issues
            .getFileIssueKeys(context.file.path)
            .includes('EXTENSION_MISMATCH'),
          true,
        )
      })
  
  })

Deno.test('test checkMissingRules', async (t) => {
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


})