import { assertEquals } from '../deps/asserts.ts'
import { DatasetIssues } from '../issues/datasetIssues.ts'
import { psychDSContext, psychDSContextDataset } from './context.ts'
import { FileIgnoreRules } from "../files/ignore.ts";
import { psychDSFileDeno, readFileTree } from "../files/deno.ts";
import { psychDSFile } from "../types/file.ts";
import { ValidatorOptions } from "../setup/options.ts";
import { resolve } from '../deps/path.ts'
import { closeResources } from "../utils/resources.ts";

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
  const description = await ddFile.text().then((text) => JSON.parse(text))
  dsContext = new psychDSContextDataset({datasetPath:PATH} as ValidatorOptions, description)
}


Deno.test('test context LoadSidecar', async (t) => {
  await t.step('file sidecar overwrites directory sidecar', async() => {
    const fileName = '/data/raw_data/study-bfi_data.csv'
    const file = new psychDSFileDeno(PATH, fileName, ignore)

    const context = new psychDSContext(fileTree, file, issues,dsContext)
    
    await context.loadSidecar(fileTree)
    closeResources()
    if("key" in context.sidecar)
      assertEquals(context.sidecar.key,"value")
    else
      assertEquals(1,2)
  })

  await t.step('directory sidecar overwrites dataset_description', async() => {
    const fileName = '/data/raw_data/study-other_data.csv'
    const file = new psychDSFileDeno(PATH, fileName, ignore)

    const context = new psychDSContext(fileTree, file, issues,dsContext)
    
    await context.loadSidecar(fileTree)
    closeResources()
    if("key" in context.sidecar)
      assertEquals(context.sidecar.key,"value2")
    else
      assertEquals(1,2)
  })

})

Deno.test('test getExpandedSidecar', async (t) => {
  await t.step('sidecar expanded', async() => {
    const fileName = '/data/raw_data/study-bfi_data.csv'
    const file = new psychDSFileDeno(PATH, fileName, ignore)

    const context = new psychDSContext(fileTree, file, issues,dsContext)
    
    await context.loadSidecar(fileTree)
    closeResources()
    assertEquals("http://schema.org/name" in context.expandedSidecar,true)
  })

  await t.step('no context in sidecar', async() => {
    const fileName = '/data/raw_data/study-other_data.csv'
    const file = new psychDSFileDeno(PATH, fileName, ignore)

    const context = new psychDSContext(fileTree, file, issues,dsContext)
    if("@context" in context.sidecar)
      delete context.sidecar['@context']
    
    await context.loadSidecar(fileTree)
    closeResources()
    assertEquals("http://schema.org/name" in context.expandedSidecar,false)
  })

  await t.step('value in root object', async() => {
    const fileName = '/data/raw_data/study-other_data.csv'
    const file = new psychDSFileDeno(PATH, fileName, ignore)

    const context = new psychDSContext(fileTree, file, issues,dsContext)
    Object.assign(context.sidecar,{"@value":"test"})
    
    await context.loadSidecar(fileTree)
    closeResources()
    assertEquals("http://schema.org/name" in context.expandedSidecar,false)
  })
  await t.step('object as value of index', async() => {
    const fileName = '/data/raw_data/study-other_data.csv'
    const file = new psychDSFileDeno(PATH, fileName, ignore)

    const context = new psychDSContext(fileTree, file, issues,dsContext)
    Object.assign(context.sidecar,{"@index":{"@type":"Dataset"}})
    
    await context.loadSidecar(fileTree)
    closeResources()
    assertEquals(context.issues.has('INVALID_JSONLD_SYNTAX'),true)
  })

})