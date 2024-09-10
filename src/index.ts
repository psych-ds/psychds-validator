import { validate } from './validate.ts';
import { consoleFormat } from './utils/output.ts';
import { parseOptions } from './setup/options.ts';
import path from 'node:path';
import { readFileTree } from './files/deno.ts';

export { validate };

/**
 * Main function to run the validator in a Node.js environment.
 * This function is designed to work with both ESM and CJS in npm.
 * 
 * @param {string[]} args - Command line arguments.
 */
export async function run(args: string[] = []) {
    try {
        // Parse command line options
        const options = parseOptions(args);
        
        // Convert relative path to absolute
        const absolutePath = path.resolve(options.datasetPath);
        
        // Read the file tree from the specified path
        const fileTree = await readFileTree(absolutePath);

        if(options.useEvents){
            const { result, emitter } = await validate(fileTree, { ...options, useEvents: true }) as { result: Promise<ValidationResult>; emitter: EventEmitter };
        
            const progressTracker = new ValidationProgressTracker(emitter);
            const validationResult = await progressTracker.waitForCompletion();
        }
        
        // Perform validation
        const result = await validate(fileTree, options);

        // Output results based on specified format
        if (options.json) {
            // Convert Map to Array for JSON serialization
            console.log(JSON.stringify(result, (_, value) => 
                value instanceof Map ? Array.from(value.values()) : value
            ));
        } else {
            // Format output for console
            console.log(consoleFormat(result, {
                verbose: options.verbose ?? false,
                showWarnings: options.showWarnings ?? false
            }));
        }
    } catch (error) {
        console.error('An error occurred:', error);
    }
}

// Run the validator if this is the main module
if (import.meta.main) {
    run(Deno.args);
}