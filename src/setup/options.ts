import { LevelName, LogLevelNames } from '../deps/logger.ts'
import { Command, EnumType } from '../deps/cliffy.ts'

export type ValidatorOptions = {
    datasetPath: string
    schema?: string
    legacy?: boolean
    json?: boolean
    verbose?: boolean
    showWarnings?: boolean
    debug: LevelName
  }

/**
 * Parse command line options and return a ValidatorOptions config
 * @param argumentOverride Override the arguments instead of using Deno.args
 */
export async function parseOptions(
    argumentOverride: string[] = Deno.args,
  ): Promise<ValidatorOptions> {
    const { args, options } = await new Command()
      .name('psychds-validator')
      .type('debugLevel', new EnumType(LogLevelNames))
      .description(
        'This tool checks if a dataset in a given directory is compatible with the psych-DS specification. To learn more about psych-DS visit https://psych-ds.github.io/',
      )
      .arguments('<dataset_directory>')
      .version('alpha')
      .option('--json', 'Output machine readable JSON')
      .option(
        '-s, --schema <type:string>',
        'Specify a schema version to use for validation',
        {
          default: 'latest',
        },
      )
      .option('-v, --verbose', 'Log more extensive information about issues')
      .option('--debug <type:debugLevel>', 'Enable debug output', {
        default: 'ERROR',
      })
      .option(
        '-w, --showWarnings',
        'Include warnings and suggestions in addition to errors'
      )
      .parse(argumentOverride)
    return {
      datasetPath: args[0],
      ...options,
      debug: options.debug as LevelName,
    }
  }