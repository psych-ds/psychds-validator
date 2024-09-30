import { assertEquals, assert } from '../deps/asserts.ts'
import { loadSchema } from '../setup/loadSchema.ts'
import { applyRules } from './applyRules.ts'
import { DatasetIssues } from '../issues/datasetIssues.ts'
import { FileIgnoreRules } from "../files/ignore.ts";
import { psychDSFileDeno, readFileTree } from "../files/deno.ts";
import { psychDSContext, psychDSContextDataset } from "./context.ts";
import { GenericSchema } from "../types/schema.ts";
import { psychDSFile } from "../types/file.ts";
import { ValidatorOptions } from "../setup/options.ts";
import jsonld from 'jsonld';

// Define constants for file paths to improve maintainability
const BASE_PATH = 'test_data/valid_datasets/bfi-dataset';
const INVALID_PATH = 'test_data/invalid_datasets/bfi-dataset';
const NO_CONTEXT_PATH = 'test_data/invalid_datasets/bfi-dataset_nocontext';
const NO_TYPE_PATH = 'test_data/invalid_datasets/bfi-dataset_notype';
const WRONG_TYPE_PATH = 'test_data/invalid_datasets/bfi-dataset_wrongtype';

/**
 * Helper function to set up the test environment.
 * This function encapsulates the common setup logic for each test,
 * reducing code duplication and improving maintainability.
 */
async function setupTest(path: string, fileName: string) {
  const schema = await loadSchema();
  const fileTree = await readFileTree(path);
  const issues = new DatasetIssues(schema as unknown as GenericSchema);
  const ignore = new FileIgnoreRules([]);

  const ddFile = fileTree.files.find(
    (file: psychDSFile) => file.name === 'dataset_description.json',
  );
  
  let dsContext;
  if (ddFile) {
    const description = await ddFile.text()
      .then(JSON.parse)
    dsContext = new psychDSContextDataset({datasetPath: path} as ValidatorOptions, ddFile, description);
  }

  const file = new psychDSFileDeno(path, fileName, ignore);
  
  const context = new psychDSContext(fileTree, file, issues, dsContext);
  await context.asyncLoads();

  return { schema, context };
}

Deno.test({
  name:'test applyRules.ts', 
  sanitizeResources: false,
  fn: async(t) => {
    // Test cases remain largely the same, but now use the setupTest helper function

    await t.step('Columns Found', async () => {
      const { schema, context } = await setupTest(BASE_PATH, '/data/raw_data/study-bfi_data.csv');
      context.validColumns = ["A1","A2","A3","A4","A5","C1","C2","C3","C4","C5","E1","E2","E3","E4","E5","N1","N2","N3","N4","N5","O1","O2","O3","O4","O5","gender","education","age"];
      
      await applyRules(schema as unknown as GenericSchema, context);
      assertEquals(context.issues.has('CSV_COLUMN_MISSING'), false);
    });

    await t.step('Columns Not Found', async () => {
      const { schema, context } = await setupTest(BASE_PATH, '/data/raw_data/study-bfi_data.csv');
      context.validColumns = [];
      
      await applyRules(schema as unknown as GenericSchema, context);
      assertEquals(context.issues.has('CSV_COLUMN_MISSING'), true);
    });

    await t.step('Fields found', async () => {
      const { schema, context } = await setupTest(BASE_PATH, '/data/raw_data/study-bfi_data.csv');
      
      await applyRules(schema as unknown as GenericSchema, context);
      assertEquals(context.issues.has('JSON_KEY_REQUIRED'), false);
    });

    await t.step('Fields missing', async () => {
      const { schema, context } = await setupTest(INVALID_PATH, '/data/raw_data/study-bfi_data.csv');
      
      await applyRules(schema as unknown as GenericSchema, context);
      assertEquals(context.issues.has('JSON_KEY_REQUIRED'), true);
    });

    await t.step('Context missing', async () => {
      const { schema, context } = await setupTest(NO_CONTEXT_PATH, '/data/raw_data/study-bfi_data.csv');
      
      await applyRules(schema as unknown as GenericSchema, context);
      assertEquals(context.issues.has('JSON_KEY_REQUIRED'), true);
    });

    await t.step('@type missing', async () => {
      const { schema, context } = await setupTest(NO_TYPE_PATH, '/data/raw_data/study-bfi_data.csv');
      
      await applyRules(schema as unknown as GenericSchema, context);
      assertEquals(context.issues.has('MISSING_DATASET_TYPE'), true);
    });

    await t.step('@type incorrect', async () => {
      const { schema, context } = await setupTest(WRONG_TYPE_PATH, '/data/raw_data/study-bfi_data.csv');
      
      await applyRules(schema as unknown as GenericSchema, context);
      assertEquals(context.issues.has('INCORRECT_DATASET_TYPE'), true);
    });

    await t.step('non-schema.org field found', async () => {
      const { schema, context } = await setupTest(BASE_PATH, '/data/raw_data/study-bfi_data.csv');
      if (context.dataset.metadataFile) {
        let description = await context.dataset.metadataFile.text();
        description = description
          .replace('https://schema.org','http://schema.org')
          .replace('https://www.schema.org','http://schema.org');
        let json = await JSON.parse(description) as object;
        json = {
          ...json,
          'testProp':''
        };
        context.dataset.dataset_description = (await jsonld.expand(json))[0];
      }
      
      await applyRules(schema as unknown as GenericSchema, context);
      assertEquals(context.issues.has('INVALID_SCHEMAORG_PROPERTY'), true);
    });

    await t.step('invalid object type', async () => {
      const { schema, context } = await setupTest(INVALID_PATH, '/data/raw_data/study-bfi_data.csv');
      
      await applyRules(schema as unknown as GenericSchema, context);
      assertEquals(context.issues.has('INVALID_OBJECT_TYPE'), true);
    });

    await t.step('missing object type', async () => {
      const { schema, context } = await setupTest(INVALID_PATH, '/data/raw_data/study-bfi_data.csv');
      
      await applyRules(schema as unknown as GenericSchema, context);
      assertEquals(context.issues.has('OBJECT_TYPE_MISSING'), true);
    });

    await t.step('unknown namespace', async () => {
      const { schema, context } = await setupTest(INVALID_PATH, '/data/raw_data/study-bfi_data.csv');
      
      await applyRules(schema as unknown as GenericSchema, context);
      assertEquals(context.issues.has('UNKNOWN_NAMESPACE'), true);
    });

    await t.step('correct sidecar identified', async () => {
      const { schema, context } = await setupTest(BASE_PATH, '/data/raw_data/study-bfi_data.csv');
      
      await applyRules(schema as unknown as GenericSchema, context);
      if(context.issues.has('INVALID_SCHEMAORG_PROPERTY')) {
        assert(context.issues.get('INVALID_SCHEMAORG_PROPERTY')?.files.has('/data/raw_data/study-bfi_data.json'));
      }
    });
  }
});