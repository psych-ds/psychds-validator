import { parseOptions } from './setup/options.ts'
import { setupLogging } from './utils/logger.ts'
import { resolve } from './deps/path.ts'
import { validate } from './validators/psychds.ts'
import { consoleFormat } from './utils/output.ts'
import { readFileTree } from './files/deno.ts'

/*
 * main function for validator. Grabs arguments from command line, constructs file tree,
 * validates dataset, and returns either json object or formatted output text. 
 * 
 * CLI Arguments:
 * datasetPath: path to root of dataset to validate
 * --verbose -v: don't cut off output text if too long
 * --showWarnings -w: display warnings in addition to errors
 * --json: return output as json object
 * --schema: specify schema version
 * 
*/
export async function main() {
    const options = await parseOptions(Deno.args)
    setupLogging(options.debug)
    const absolutePath = resolve(options.datasetPath)
    const tree = await readFileTree(absolutePath)
    
    const schemaResult = await validate(tree, options)

    if (options.json) {
        console.log(
          JSON.stringify(schemaResult, (_, value) => {
            if (value instanceof Map) {
              return Array.from(value.values())
            } else {
              return value
            }
          }),
        )
      } else {
        console.log(
          consoleFormat(schemaResult, {
            verbose: options.verbose ? options.verbose : false,
            showWarnings: options.showWarnings ? options.showWarnings : false
          }),
        )
      }
}