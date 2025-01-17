/**
 * @fileoverview Handles command-line argument parsing and configuration options
 * for the Psych-DS validator. Provides type definitions and parsing functionality
 * for validator configuration.
 */

import { LevelName, LogLevels } from "../utils/logger.ts";
import { Command, Option } from "npm:commander";

/**
 * Configuration options for the validator
 */
export type ValidatorOptions = {
  /** Path to the dataset directory to validate */
  datasetPath: string;

  /** Schema version to use for validation */
  schema?: string;

  /** Whether to support legacy features (deprecated) */
  legacy?: boolean;

  /** Whether to output in JSON format for machine readability */
  json?: boolean;

  /** Whether to provide verbose output with additional details */
  verbose?: boolean;

  /** Whether to include warnings in addition to errors */
  showWarnings?: boolean;

  /** Log level for debug output */
  debug: LevelName;

  /** Whether to display validation progress sequentially */
  useEvents?: boolean;
};

/**
 * Parses command line arguments and builds validator configuration
 *
 * This function sets up the command-line interface using Commander and processes
 * the provided arguments into a structured configuration object. It handles:
 * - Required dataset directory path
 * - Optional schema version
 * - Various output format options
 * - Debug and verbosity settings
 *
 * @param argumentOverride - Optional array of arguments to use instead of Deno.args
 * @returns Parsed configuration options for the validator
 */
export function parseOptions(
  argumentOverride: string[] = Deno.args,
): ValidatorOptions {
  const args = argumentOverride || Deno.args;
  const program = new Command();

  // Configure the command-line interface
  program
    .name("psychds-validator")
    .description(
      "This tool checks if a dataset in a given directory is compatible with the psych-DS specification. To learn more about psych-DS visit https://psych-ds.github.io/",
    )
    .argument("<dataset_directory>", "Path to the dataset directory")
    .version("alpha")
    .option("--useEvents", "Display validation progress sequentially")
    .option("--json", "Output machine readable JSON")
    .option(
      "-s, --schema <type>",
      "Specify a schema version to use for validation",
      "1.4.0",
    )
    .option("-v, --verbose", "Log more extensive information about issues")
    .addOption(
      new Option("--debug <level>", "Enable debug output")
        .choices(Object.values(LogLevels))
        .default("error"),
    )
    .option(
      "-w, --showWarnings",
      "Include warnings and suggestions in addition to errors",
    );

  // Parse arguments and convert to ValidatorOptions
  program.parse(args, { from: "user" });

  const options = program.opts();
  const parsedArgs = program.args;

  return {
    datasetPath: parsedArgs[0],
    schema: options.schema,
    useEvents: options.useEvents,
    json: options.json,
    verbose: options.verbose,
    showWarnings: options.showWarnings,
    debug: options.debug as LevelName,
  };
}
