import { validate as validateInternal } from './validators/psychds.ts';
import { ValidatorOptions } from './setup/options.ts';
import { ValidationResult } from './types/validation-result.ts';
import { readFileTree } from './files/deno.ts';
import { FileTree } from './types/filetree.ts';
import { EventEmitter } from './utils/platform.ts';
import {ValidationProgressTracker} from './utils/validationProgressTracker.ts'


/**
 * Validate a file tree or a path to a dataset.
 * This function is designed to work in both command-line and import contexts.
 * 
 * @param {{ [key: string]: any }} fileTree - Either a FileTree object or a string path to the dataset.
 * @param {Partial<ValidatorOptions>} [options] - Optional validator options.
 * @returns {Promise<ValidationResult>} A promise that resolves to the validation result.
 */
// deno-lint-ignore no-explicit-any
export async function validateWeb(fileTree: { [key: string]: any }, options: ValidatorOptions & { emitter?: typeof EventEmitter }): Promise<ValidationResult> {

    const builtFileTree = await readFileTree(fileTree) as FileTree

    return validateInternal(builtFileTree, options);


}

export { ValidationProgressTracker }