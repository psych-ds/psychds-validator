import { LevelName, LogLevels } from '../utils/logger.ts'
import { Command, Option } from 'npm:commander';

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
export function parseOptions(
    argumentOverride: string[] = Deno.args,
  ): ValidatorOptions {
    const args = argumentOverride || Deno.args;
    const program = new Command();

    program
        .name('psychds-validator')
        .description('This tool checks if a dataset in a given directory is compatible with the psych-DS specification. To learn more about psych-DS visit https://psych-ds.github.io/')
        .argument('<dataset_directory>', 'Path to the dataset directory')
        .version('alpha')
        .option('--json', 'Output machine readable JSON')
        .option('-s, --schema <type>', 'Specify a schema version to use for validation', 'latest')
        .option('-v, --verbose', 'Log more extensive information about issues')
        .addOption(new Option('--debug <level>', 'Enable debug output').choices(Object.values(LogLevels)).default('ERROR'))
        .option('-w, --showWarnings', 'Include warnings and suggestions in addition to errors');

    program.parse(args, { from: 'user' });

    const options = program.opts();
    const parsedArgs = program.args;

    return {
      datasetPath: parsedArgs[0],
      schema: options.schema,
      json: options.json,
      verbose: options.verbose,
      showWarnings: options.showWarnings,
      debug: options.debug as LevelName,
  };
  }