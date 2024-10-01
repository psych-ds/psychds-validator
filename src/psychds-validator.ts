import { validate } from './validators/psychds.ts';
import { parseOptions } from './setup/options.ts';
import { readFileTree } from './files/deno.ts';
import path from 'node:path';
import { consoleFormat } from './utils/output.ts';
import {ValidationProgressTracker} from './utils/validationProgressTracker.ts'
import { EventEmitter } from 'node:events';

/**
 * Main function to run the validator in a Deno environment.
 * This function is specifically designed for use with Deno.
 * 
 * @param {string[]} args - Command line arguments. Defaults to Deno.args.
 */
export async function run(args: string[] = Deno.args) {
    try {
        // Parse command line options
        const options = parseOptions(args);
        
        // Convert relative path to absolute
        const absolutePath = path.resolve(options.datasetPath);
        
        // Read the file tree from the specified path
        const fileTree = await readFileTree(absolutePath);

        if(options.useEvents){
            // Create event emitter
            const emitter = new EventEmitter();
            // Start progress tracker
            const progressTracker = new ValidationProgressTracker(emitter);

            // Validate
            const _resultPromise = await validate(fileTree, { ...options, useEvents: true, emitter });

            await progressTracker.waitForCompletion();

            Deno.exit(0);
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
        Deno.exit(1);
    }
}

// Run the validator if this is the main module
if (import.meta.main) {
    run();
}