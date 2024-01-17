import { assertEquals } from '../deps/asserts.ts'
import { psychDSContext } from '../schema/context.ts'
import { psychDSFileDeno } from '../files/deno.ts'
import { FileTree } from '../types/filetree.ts'
import { DatasetIssues } from '../issues/datasetIssues.ts'
import { FileIgnoreRules } from '../files/ignore.ts'


const PATH = 'test_data/valid_datasets/bfi-dataset'
const fileTree = new FileTree(PATH, '/')
const issues = new DatasetIssues()
const ignore = new FileIgnoreRules([])

Deno.test('Test parseCSV', async (t) => {
    await t.step('csv exists', async() => {
        const fileName = '/data/raw_data/study-bfi_data.csv'
        const file = new psychDSFileDeno(PATH, fileName, ignore)
        const context = new psychDSContext(fileTree, file, issues)
        await context.asyncLoads()
        assertEquals(Object.keys(context.columns).length,28)
    })

    await t.step('csv does not exist', async() => {
        let errFound = false
        const fileName = '/data/raw_data/study-bfi_datas.csv'
        try{
            const file = new psychDSFileDeno(PATH, fileName, ignore)
            const context = new psychDSContext(fileTree, file, issues)
            await context.asyncLoads()
        }
        catch(error){
            if (error.name === "NotFound")
                errFound = true
        }
        assertEquals(errFound,true)
    })

  })