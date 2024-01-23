import { resolve } from '../deps/path.ts'
import { validate } from './psychds.ts'
import { readFileTree } from '../files/deno.ts'
import { ValidatorOptions } from '../setup/options.ts'
import { assertEquals } from "../deps/asserts.ts";


Deno.test('test validate (valid datasets)', async (t) => {
    await t.step('bfi-dataset', async () => {
      const PATH = 'test_data/valid_datasets/bfi-dataset'
      const absolutePath = resolve(PATH)
      const tree = await readFileTree(absolutePath)
      const schemaResult = await validate(tree, {datasetPath:PATH} as ValidatorOptions)
      assertEquals(schemaResult.valid,true)
    })

    await t.step('complex-metadata-dataset', async () => {
        const PATH = 'test_data/valid_datasets/complex-metadata-dataset'
        const absolutePath = resolve(PATH)
        const tree = await readFileTree(absolutePath)
        const schemaResult = await validate(tree, {datasetPath:PATH} as ValidatorOptions)
        assertEquals(schemaResult.valid,true)
      })
    
    await t.step('face-body', async () => {
        const PATH = 'test_data/valid_datasets/face-body'
        const absolutePath = resolve(PATH)
        const tree = await readFileTree(absolutePath)
        const schemaResult = await validate(tree, {datasetPath:PATH} as ValidatorOptions)
        assertEquals(schemaResult.valid,true)
    })

    await t.step('mistakes-corrected-dataset', async () => {
        const PATH = 'test_data/valid_datasets/mistakes-corrected-dataset'
        const absolutePath = resolve(PATH)
        const tree = await readFileTree(absolutePath)
        const schemaResult = await validate(tree, {datasetPath:PATH} as ValidatorOptions)
        assertEquals(schemaResult.valid,true)
    })

    await t.step('nih-reviews', async () => {
        const PATH = 'test_data/valid_datasets/nih-reviews'
        const absolutePath = resolve(PATH)
        const tree = await readFileTree(absolutePath)
        const schemaResult = await validate(tree, {datasetPath:PATH} as ValidatorOptions)
        assertEquals(schemaResult.valid,true)
    })
  
  
  })

  Deno.test('test validate (invalid datasets)', async (t) => {
    await t.step('bfi-dataset', async () => {
      const PATH = 'test_data/invalid_datasets/bfi-dataset'
      const absolutePath = resolve(PATH)
      const tree = await readFileTree(absolutePath)
      const schemaResult = await validate(tree, {datasetPath:PATH} as ValidatorOptions)
      assertEquals(schemaResult.valid,false)
    })

    await t.step('complex-metadata-dataset', async () => {
        const PATH = 'test_data/invalid_datasets/complex-metadata-dataset'
        const absolutePath = resolve(PATH)
        const tree = await readFileTree(absolutePath)
        const schemaResult = await validate(tree, {datasetPath:PATH} as ValidatorOptions)
        
        assertEquals(schemaResult.valid,false)
      })

    await t.step('face-body', async () => {
        const PATH = 'test_data/invalid_datasets/face-body'
        const absolutePath = resolve(PATH)
        const tree = await readFileTree(absolutePath)
        const schemaResult = await validate(tree, {datasetPath:PATH} as ValidatorOptions)
        assertEquals(schemaResult.valid,false)
    })

    await t.step('informative-mistakes-dataset', async () => {
        const PATH = 'test_data/invalid_datasets/informative-mistakes-dataset'
        const absolutePath = resolve(PATH)
        const tree = await readFileTree(absolutePath)
        const schemaResult = await validate(tree, {datasetPath:PATH} as ValidatorOptions)
        assertEquals(schemaResult.valid,false)
    })

    await t.step('nih-reviews', async () => {
        const PATH = 'test_data/invalid_datasets/nih-reviews'
        const absolutePath = resolve(PATH)
        const tree = await readFileTree(absolutePath)
        const schemaResult = await validate(tree, {datasetPath:PATH} as ValidatorOptions)
        assertEquals(schemaResult.valid,false)
    })
  
  
  })

    