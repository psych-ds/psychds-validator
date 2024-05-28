import { assertEquals } from '../deps/asserts.ts'
import { DatasetIssues } from '../issues/datasetIssues.ts'
import { psychDSContext, psychDSContextDataset } from './context.ts'
import { FileIgnoreRules } from "../files/ignore.ts";
import { psychDSFileDeno, readFileTree } from "../files/deno.ts";
import { psychDSFile } from "../types/file.ts";
import { ValidatorOptions } from "../setup/options.ts";
import { resolve } from '../deps/path.ts'

const PATH = 'test_data/valid_datasets/bfi-dataset'
const absolutePath = resolve(PATH)
const fileTree = await readFileTree(absolutePath)
const issues = new DatasetIssues()
const ignore = new FileIgnoreRules([])
const ddFile = fileTree.files.find(
  (file: psychDSFile) => file.name === 'dataset_description.json',
)
let dsContext: psychDSContextDataset = new psychDSContextDataset()
if (ddFile) {
  const description = ddFile.expanded
  dsContext = new psychDSContextDataset({datasetPath:PATH} as ValidatorOptions, ddFile,description)
}


Deno.test({
  name:'test context LoadSidecar', 
  sanitizeResources: false,
  fn: async (t) => {
  await t.step('file sidecar overwrites directory sidecar', async() => {
    const fileName = '/data/raw_data/study-bfi_data.csv'
    const file = new psychDSFileDeno(absolutePath, fileName, ignore)
    

    const context = new psychDSContext(fileTree, file, issues,dsContext)
    
    await context.loadSidecar(fileTree)
    console.log(context.sidecar)
    if("http://schema.org/key" in context.sidecar){
      assertEquals(context.sidecar['http://schema.org/key'],[{"@value":"value"}])}
    else
      assertEquals(1,2)
  })

  await t.step('directory sidecar overwrites dataset_description', async() => {
    const fileName = '/data/raw_data/study-other_data.csv'
    const file = new psychDSFileDeno(PATH, fileName, ignore)

    const context = new psychDSContext(fileTree, file, issues,dsContext)
    
    await context.loadSidecar(fileTree)
    if("http://schema.org/key" in context.sidecar)
      assertEquals(context.sidecar['http://schema.org/key'],[{"@value":"value2"}])
    else
      assertEquals(1,2)
  })

}})

Deno.test({
  name:'test getExpandedSidecar', 
  sanitizeResources: false,
  fn: async (t) => {
    await t.step('sidecar expanded', async() => {
      const fileName = '/data/raw_data/study-bfi_data.csv'
      const file = new psychDSFileDeno(PATH, fileName, ignore)

      const context = new psychDSContext(fileTree, file, issues,dsContext)
      
      await context.loadSidecar(fileTree)
      assertEquals("http://schema.org/name" in context.sidecar,true)
    })

    await t.step('no context in sidecar', async() => {
      const fileName = '/data/raw_data/study-bfi_data.csv'
      const noCtxPATH = 'test_data/invalid_datasets/bfi-dataset_nocontext'
      const noCtxFileTree = await readFileTree(noCtxPATH)
      const file = new psychDSFileDeno(noCtxPATH, fileName, ignore)
      const ddFile = noCtxFileTree.files.find(
        (file: psychDSFile) => file.name === 'dataset_description.json',
      )
      let dsContext: psychDSContextDataset = new psychDSContextDataset()
      if (ddFile) {
        const description = ddFile.expanded
        dsContext = new psychDSContextDataset({datasetPath:noCtxPATH} as ValidatorOptions, ddFile,description)
      }

      const context = new psychDSContext(noCtxFileTree, file, issues,dsContext)
      if("@context" in context.sidecar)
        delete context.sidecar['@context']
      
      await context.loadSidecar(noCtxFileTree)
      assertEquals("http://schema.org/name" in context.sidecar,false)
    })
  }
})