import { validate as validateInternal } from './validators/psychds.ts';
import { ValidatorOptions } from './setup/options.ts';
import { ValidationResult } from './types/validation-result.ts';
import { readFileTree } from './files/deno.ts';
import { EventEmitter } from './utils/platform.ts';
import {ValidationProgressTracker} from './utils/validationProgressTracker.ts'


/**
 * Validate a file tree or a path to a dataset.
 * This function is designed to work in both command-line and import contexts.
 * 
 * @param {FileTree | string} fileTreeOrPath - Either a FileTree object or a string path to the dataset.
 * @param {Partial<ValidatorOptions>} [options] - Optional validator options.
 * @returns {Promise<ValidationResult>} A promise that resolves to the validation result.
 */
export async function validateWeb(fileTree: { [key: string]: unknown }, options?: ValidatorOptions & { emitter?: EventEmitter }): Promise<ValidationResult> {

    fileTree = await readFileTree(fileTree)

    return validateInternal(fileTree, options);


}

export { ValidationProgressTracker }