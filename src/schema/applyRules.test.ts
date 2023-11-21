
import { assertEquals } from '../deps/asserts.ts'
import { loadSchema } from '../setup/loadSchema.ts'
import { applyRules  } from './applyRules.ts'
import { DatasetIssues } from '../issues/datasetIssues.ts'
import { FileIgnoreRules } from "../files/ignore.ts";
import { FileTree } from "../types/filetree.ts";
import { psychDSFileDeno } from "../files/deno.ts";
import { psychDSContext, psychDSContextDataset } from "./context.ts";
import { GenericSchema } from "../types/schema.ts";
import { psychDSFile } from "../types/file.ts";
import { ValidatorOptions } from "../setup/options.ts";

const PATH = 'test_data/valid_datasets/bfi-dataset'
const schema = await loadSchema()
const fileTree = new FileTree(PATH, '/')
const issues = new DatasetIssues()
const ignore = new FileIgnoreRules([])

Deno.test('applyRules test', async(t) => {
    await t.step('Columns Found', async () => {
        const fileName = '/data/raw_data/study-bfi_data.csv'
        const file = new psychDSFileDeno(PATH, fileName, ignore)
        const context = new psychDSContext(fileTree, file, issues)
        await context.asyncLoads()
        context.validColumns = ["A1","A2","A3","A4","A5","C1","C2","C3","C4","C5","E1","E2","E3","E4","E5","N1","N2","N3","N4","N5","O1","O2","O3","O4","O5","gender","education","age"]

        await applyRules(schema as unknown as GenericSchema,context)
        assertEquals(context.issues.has('CSV_COLUMN_MISSING'),false)
    })
    await t.step('Columns Not Found', async () => {
        const fileName = '/data/raw_data/study-bfi_data.csv'
        const file = new psychDSFileDeno(PATH, fileName, ignore)
        const context = new psychDSContext(fileTree, file, issues)
        await context.asyncLoads()
        context.validColumns = []
        await applyRules(schema as unknown as GenericSchema,context)
        
        assertEquals(context.issues.has('CSV_COLUMN_MISSING'),true)
    })
    await t.step('Fields found', async () => {
        const fileName = '/dataset_description.json'
        const file = new psychDSFileDeno(PATH, fileName, ignore)
        const context = new psychDSContext(fileTree, file, issues)
        await context.asyncLoads()
        context.dataset.dataset_description.variableMeasured = []
        context.validColumns = []
        await applyRules(schema as unknown as GenericSchema,context)
        assertEquals(context.issues.has('JSON_KEY_REQUIRED'),true)
    })
    await t.step('Fields missing', async () => {
        const ddFile = fileTree.files.find(
            (file: psychDSFile) => file.name === 'dataset_description.json',
          )
          let dsContext
          if (ddFile) {
            const description = await ddFile.text().then((text) => JSON.parse(text))
            //console.log(description)
            dsContext = new psychDSContextDataset({datasetPath:PATH} as ValidatorOptions, description)
            //console.log(dsContext)
          } else {
            dsContext = new psychDSContextDataset({datasetPath:PATH} as ValidatorOptions)
          }
        const fileName = 'dataset_description.json'
        const file = new psychDSFileDeno(PATH, fileName, ignore)
        const context = new psychDSContext(fileTree, file, issues,dsContext)
        await context.asyncLoads()
        context.validColumns = []
        await applyRules(schema as unknown as GenericSchema,context)
        
        
        assertEquals(context.issues.has('JSON_KEY_REQUIRED'),true)
    })

    
})

