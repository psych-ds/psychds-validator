import { validate as validateInternal } from './validators/psychds.ts';
import { parseOptions, ValidatorOptions } from './setup/options.ts';
import { FileTree } from './types/filetree.ts';
import { ValidationResult } from './types/validation-result.ts';
import { readFileTree } from './files/deno.ts';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import {ValidationProgressTracker} from './utils/validationProgressTracker.ts'


/**
 * Validate a file tree or a path to a dataset.
 * This function is designed to work in both command-line and import contexts.
 * 
 * @param {FileTree | string} fileTreeOrPath - Either a FileTree object or a string path to the dataset.
 * @param {Partial<ValidatorOptions>} [options] - Optional validator options.
 * @returns {Promise<ValidationResult>} A promise that resolves to the validation result.
 */
export async function validate(fileTreeOrPath: FileTree | string, options?: ValidatorOptions & { emitter?: EventEmitter }): Promise<ValidationResult> {
    let fileTree: FileTree;

    // Determine if fileTreeOrPath is a string (path) or a FileTree object
    const isPathString = typeof fileTreeOrPath === 'string';

    // Prepare arguments for parseOptions
    const args: string[] = isPathString ? [fileTreeOrPath] : [];

    if (options) {
        // Convert options object to array of CLI-style arguments
        if (options.datasetPath && !isPathString) args.push(options.datasetPath);
        if (options.schema) args.push('--schema', options.schema);
        if (options.json) args.push('--json');
        if (options.verbose) args.push('--verbose');
        if (options.showWarnings) args.push('--showWarnings');
        if (options.debug) args.push('--debug', options.debug);
        if (options.useEvents) args.push('--useEvents')
    }

    // Parse options with the prepared arguments
    const fullOptions: ValidatorOptions = parseOptions(args);

    if (isPathString) {
        // If a string path is provided, read the file tree
        const absolutePath = path.resolve(fileTreeOrPath as string);
        fileTree = await readFileTree(absolutePath);
        fullOptions.datasetPath = absolutePath;
    } else {
        // If a FileTree object is provided, use it directly
        fileTree = fileTreeOrPath as FileTree;
    }

    if (options && options.useEvents){
        const emitter = new EventEmitter();
        const progressTracker = new ValidationProgressTracker(emitter);

        const resultPromise = validateInternal(fileTree, { ...fullOptions, emitter });

        const result = await resultPromise;
        await progressTracker.waitForCompletion();

        return result

    }
    else{
        return validateInternal(fileTree, fullOptions);

    }


}