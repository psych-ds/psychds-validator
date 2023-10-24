import { parseOptions } from './setup/options.ts'
import { setupLogging } from './utils/logger.ts'
import { resolve } from './deps/path.ts'
import { validate } from './validators/psychds.ts'
import { consoleFormat } from './utils/output.ts'
import { readFileTree } from './files/deno.ts'

export async function main() {
    const options = await parseOptions(Deno.args)
    setupLogging(options.debug)
    const absolutePath = resolve(options.datasetPath)
    const tree = await readFileTree(absolutePath)
    
    const schemaResult = await validate(tree, options)

    if (options.json) {
        console.log(
          JSON.stringify(schemaResult, (key, value) => {
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