import { validate } from "./validate.ts";
import { consoleFormat } from "./utils/output.ts";
import { parseOptions } from "./setup/options.ts";
import { EventEmitter, initializePlatform, path } from "./utils/platform.ts";
import { readFileTree } from "./files/deno.ts";
import { ValidationProgressTracker } from "./utils/validationProgressTracker.ts";
import process from "node:process";

export { validate };

/**
 * Main function to run the validator in a Node.js environment.
 * This function is designed to work with both ESM and CJS in npm.
 *
 * @param {string[]} args - Command line arguments.
 */
export async function run(args: string[] = []) {
  try {
    await initializePlatform();

    // Parse command line options
    const options = parseOptions(args);

    // Convert relative path to absolute
    const absolutePath = path.resolve(options.datasetPath);

    // Read the file tree from the specified path
    const fileTree = await readFileTree(absolutePath);

    if (options.useEvents) {
      // Create event emitter
      const emitter = new EventEmitter();
      // Start progress tracker
      const progressTracker = new ValidationProgressTracker(emitter);
      // Validate
      const _resultPromise = await validate(fileTree, {
        ...options,
        useEvents: true,
        emitter,
      });

      await progressTracker.waitForCompletion();

      // Use a platform-agnostic way to exit
      if (typeof process !== "undefined" && process.exit) {
        process.exit(0);
      } else if (typeof Deno !== "undefined") {
        Deno.exit(0);
      }
    }

    // Perform validation
    const result = await validate(fileTree, options);

    // Output results based on specified format
    if (options.json) {
      // Convert Map to Array for JSON serialization
      console.log(
        JSON.stringify(
          result,
          (_, value) =>
            value instanceof Map ? Array.from(value.values()) : value,
        ),
      );
    } else {
      // Format output for console
      console.log(
        await consoleFormat(result, {
          verbose: options.verbose ?? false,
          showWarnings: options.showWarnings ?? false,
        }),
      );
    }
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

// Run the validator if this is the main module
if (typeof Deno !== "undefined" && Deno.mainModule === import.meta.url) {
  run(Deno.args);
} else if (
  typeof process !== "undefined" && process.argv[1] === import.meta.url
) {
  run(process.argv.slice(2));
}
