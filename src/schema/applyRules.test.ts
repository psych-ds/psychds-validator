
import { assertEquals } from '../deps/asserts.ts'
import { loadSchema } from '../setup/loadSchema.ts'
import { applyRules  } from './applyRules.ts'
import { DatasetIssues } from '../issues/datasetIssues.ts'
import { FileIgnoreRules } from "../files/ignore.ts";
import { psychDSFileDeno, readFileTree } from "../files/deno.ts";
import { psychDSContext, psychDSContextDataset } from "./context.ts";
import { GenericSchema } from "../types/schema.ts";
import { psychDSFile } from "../types/file.ts";
import { ValidatorOptions } from "../setup/options.ts";

const PATH = 'test_data/valid_datasets/bfi-dataset'
const schema = await loadSchema()
const fileTree = await readFileTree(PATH)
const issues = new DatasetIssues(schema as unknown as GenericSchema)
const ignore = new FileIgnoreRules([])

const invPATH = 'test_data/invalid_datasets/bfi-dataset'
const invFileTree = await readFileTree(invPATH)

const noCtxPATH = 'test_data/invalid_datasets/bfi-dataset_nocontext'
const noCtxFileTree = await readFileTree(noCtxPATH)


const noTypePATH = 'test_data/invalid_datasets/bfi-dataset_notype'
const noTypeFileTree = await readFileTree(noTypePATH)

const wrongTypePATH = 'test_data/invalid_datasets/bfi-dataset_wrongtype'
const wrongTypeFileTree = await readFileTree(wrongTypePATH)




Deno.test({
  name:'applyRules test', 
  sanitizeResources: false,
  fn: async(t) => {
    await t.step('Columns Found', async () => {
      const fileName = '/data/raw_data/study-bfi_data.csv'
      const issues = new DatasetIssues()
      const ignore = new FileIgnoreRules([])
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
        const ddFile = fileTree.files.find(
          (file: psychDSFile) => file.name === 'dataset_description.json',
        )
        let dsContext
        if (ddFile) {
          const description = await ddFile.text().then((text) => JSON.parse(text))
          dsContext = new psychDSContextDataset({datasetPath:PATH} as ValidatorOptions, description)
          //console.log(dsContext)
        } else {
          dsContext = new psychDSContextDataset({datasetPath:PATH} as ValidatorOptions)
        }
      
        const fileName = '/dataset_description.json'
        const file = new psychDSFileDeno(PATH, fileName, ignore)
        const context = new psychDSContext(fileTree, file, issues,dsContext)
        await context.asyncLoads()
        context.dataset.dataset_description.variableMeasured = []
        context.validColumns = []

        await applyRules(schema as unknown as GenericSchema,context)
        assertEquals(context.issues.has('JSON_KEY_REQUIRED'),false)
    })
    await t.step('Fields missing', async () => {
      const ddFile = invFileTree.files.find(
            (file: psychDSFile) => file.name === 'dataset_description.json',
          )
          let dsContext
          if (ddFile) {
            const description = await ddFile.text().then((text) => JSON.parse(text))
            dsContext = new psychDSContextDataset({datasetPath:invPATH} as ValidatorOptions, description)
          }
        const fileName = 'dataset_description.json'
        const file = new psychDSFileDeno(invPATH, fileName, ignore)
        const context = new psychDSContext(invFileTree, file, issues,dsContext)
        await context.asyncLoads()

        context.validColumns = []
        await applyRules(schema as unknown as GenericSchema,context)
        assertEquals(context.issues.has('JSON_KEY_REQUIRED'),true)
    })
    await t.step('Context missing', async () => {
      const ddFile = noCtxFileTree.files.find(
          (file: psychDSFile) => file.name === 'dataset_description.json',
        )
        let dsContext
        if (ddFile) {
          const description = await ddFile.text().then((text) => JSON.parse(text))
          dsContext = new psychDSContextDataset({datasetPath:noCtxPATH} as ValidatorOptions, description)
        } else {
          dsContext = new psychDSContextDataset({datasetPath:noCtxPATH} as ValidatorOptions)
        }
      const fileName = 'dataset_description.json'
      const file = new psychDSFileDeno(noCtxPATH, fileName, ignore)
      const context = new psychDSContext(noCtxFileTree, file, issues,dsContext)
      
      await context.asyncLoads()

      context.validColumns = []
      await applyRules(schema as unknown as GenericSchema,context)
      assertEquals(context.issues.has('JSON_KEY_REQUIRED'),true)
    })
    await t.step('@type missing', async () => {
      const ddFile = noTypeFileTree.files.find(
          (file: psychDSFile) => file.name === 'dataset_description.json',
        )
        let dsContext
        if (ddFile) {
          const description = await ddFile.text().then((text) => JSON.parse(text))
          dsContext = new psychDSContextDataset({datasetPath:noTypePATH} as ValidatorOptions, description)
        } else {
          dsContext = new psychDSContextDataset({datasetPath:noTypePATH} as ValidatorOptions)
        }
      const fileName = 'dataset_description.json'
      const file = new psychDSFileDeno(noTypePATH, fileName, ignore)
      const context = new psychDSContext(noTypeFileTree, file, issues,dsContext)
      
      await context.asyncLoads()

      context.validColumns = []
      await applyRules(schema as unknown as GenericSchema,context)
      assertEquals(context.issues.has('MISSING_DATASET_TYPE'),true)
    })
    await t.step('@type missing', async () => {
      const ddFile = noTypeFileTree.files.find(
          (file: psychDSFile) => file.name === 'dataset_description.json',
        )
        let dsContext
        if (ddFile) {
          const description = await ddFile.text().then((text) => JSON.parse(text))
          dsContext = new psychDSContextDataset({datasetPath:noTypePATH} as ValidatorOptions, description)
        } else {
          dsContext = new psychDSContextDataset({datasetPath:noTypePATH} as ValidatorOptions)
        }
      const fileName = 'dataset_description.json'
      const file = new psychDSFileDeno(noTypePATH, fileName, ignore)
      const context = new psychDSContext(noTypeFileTree, file, issues,dsContext)
      
      await context.asyncLoads()

      context.validColumns = []
      await applyRules(schema as unknown as GenericSchema,context)
      assertEquals(context.issues.has('MISSING_DATASET_TYPE'),true)
    })
    await t.step('@type incorrect', async () => {
      const ddFile = wrongTypeFileTree.files.find(
          (file: psychDSFile) => file.name === 'dataset_description.json',
        )
        let dsContext
        if (ddFile) {
          const description = await ddFile.text().then((text) => JSON.parse(text))
          dsContext = new psychDSContextDataset({datasetPath:wrongTypePATH} as ValidatorOptions, description)
        } else {
          dsContext = new psychDSContextDataset({datasetPath:wrongTypePATH} as ValidatorOptions)
        }
      const fileName = 'dataset_description.json'
      const file = new psychDSFileDeno(wrongTypePATH, fileName, ignore)
      const context = new psychDSContext(wrongTypeFileTree, file, issues,dsContext)
      
      await context.asyncLoads()

      context.validColumns = []
      await applyRules(schema as unknown as GenericSchema,context)
      assertEquals(context.issues.has('INCORRECT_DATASET_TYPE'),true)
    })
    await t.step('non-schema.org field found', async () => {
      const ddFile = fileTree.files.find(
        (file: psychDSFile) => file.name === 'dataset_description.json',
      )
      let dsContext
      if (ddFile) {
        const description = await ddFile.text().then((text) => JSON.parse(text))
        dsContext = new psychDSContextDataset({datasetPath:wrongTypePATH} as ValidatorOptions, description)
      } else {
        dsContext = new psychDSContextDataset({datasetPath:invPATH} as ValidatorOptions)
      }

      const fileName = '/dataset_description.json'
      const file = new psychDSFileDeno(invPATH, fileName, ignore)
      const context = new psychDSContext(invFileTree, file, issues,dsContext)
      await context.asyncLoads()
      context.validColumns = []

      await applyRules(schema as unknown as GenericSchema,context)
      assertEquals(context.issues.has('INVALID_SCHEMAORG_PROPERTY'),true)
    })

    await t.step('invalid object type', async () => {
      const ddFile = invFileTree.files.find(
          (file: psychDSFile) => file.name === 'dataset_description.json',
        )
        let dsContext
        if (ddFile) {
          const description = await ddFile.text().then((text) => JSON.parse(text))
          dsContext = new psychDSContextDataset({datasetPath:invPATH} as ValidatorOptions, description)
        } else {
          dsContext = new psychDSContextDataset({datasetPath:invPATH} as ValidatorOptions)
        }
      const fileName = 'dataset_description.json'
      const file = new psychDSFileDeno(invPATH, fileName, ignore)
      const context = new psychDSContext(invFileTree, file, issues,dsContext)
      
      await context.asyncLoads()

      context.validColumns = []
      await applyRules(schema as unknown as GenericSchema,context)
      assertEquals(context.issues.has('INVALID_OBJECT_TYPE'),true)
    })

    await t.step('missing object type', async () => {
      const ddFile = invFileTree.files.find(
          (file: psychDSFile) => file.name === 'dataset_description.json',
        )
        let dsContext
        if (ddFile) {
          const description = await ddFile.text().then((text) => JSON.parse(text))
          dsContext = new psychDSContextDataset({datasetPath:invPATH} as ValidatorOptions, description)
        } else {
          dsContext = new psychDSContextDataset({datasetPath:invPATH} as ValidatorOptions)
        }
      const fileName = 'dataset_description.json'
      const file = new psychDSFileDeno(invPATH, fileName, ignore)
      const context = new psychDSContext(invFileTree, file, issues,dsContext)
      
      await context.asyncLoads()

      context.validColumns = []
      await applyRules(schema as unknown as GenericSchema,context)
      assertEquals(context.issues.has('OBJECT_TYPE_MISSING'),true)
    })
    await t.step('unknown namespace', async () => {
      const ddFile = invFileTree.files.find(
          (file: psychDSFile) => file.name === 'dataset_description.json',
        )
        let dsContext
        if (ddFile) {
          const description = await ddFile.text().then((text) => JSON.parse(text))
          dsContext = new psychDSContextDataset({datasetPath:invPATH} as ValidatorOptions, description)
        } else {
          dsContext = new psychDSContextDataset({datasetPath:invPATH} as ValidatorOptions)
        }
      const fileName = 'dataset_description.json'
      const file = new psychDSFileDeno(invPATH, fileName, ignore)
      const context = new psychDSContext(invFileTree, file, issues,dsContext)
      
      await context.asyncLoads()

      context.validColumns = []
      await applyRules(schema as unknown as GenericSchema,context)
      assertEquals(context.issues.has('UNKNOWN_NAMESPACE'),true)
    })
  }

    
})





