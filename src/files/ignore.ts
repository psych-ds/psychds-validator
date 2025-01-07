/**
 * @fileoverview Handles ignore rules for Psych-DS validation.
 * Provides functionality for reading and applying ignore patterns similar to
 * .gitignore files. Manages both default ignores and custom configurations.
 */

import { psychDSFile } from "../types/file.ts";
import { Ignore, ignore } from "../deps/ignore.ts";

/**
 * Reads and parses a .psychdsignore file
 * Converts file content into array of ignore patterns
 * 
 * @param file - File object containing ignore rules
 * @returns Promise resolving to array of ignore patterns
 */
export async function readPsychDSIgnore(file: psychDSFile) {
  const value = await file.text();
  if (value) {
    const lines = value.split("\n");
    return lines;
  } else {
    return [];
  }
}

/**
 * Default patterns to ignore during validation
 * Includes common directories and files that shouldn't be validated
 */
const defaultIgnores = [
  ".git**",          
  "*.DS_Store",      
  ".datalad/",        
  ".reproman/",       
  "sourcedata/",      
  "code/",            
  "stimuli/",         
  "materials/",       
  "results/",         
  "products/",        
  "analysis/",        
  "documentation/",   
  "log/",            
];

/**
 * Manages ignore rules for dataset validation
 * Combines default patterns with custom configurations
 */
export class FileIgnoreRules {
  /** Internal ignore rules implementation */
  #ignore: Ignore;

  /**
   * Creates new ignore rules manager
   * Initializes with default patterns and custom configuration
   * 
   * @param config - Additional ignore patterns to apply
   * 
   */
  constructor(config: string[]) {
    this.#ignore = ignore({ allowRelativePaths: true });
    this.#ignore.add(defaultIgnores);
    this.#ignore.add(config);
  }

  /**
   * Adds additional ignore patterns
   * Expands current rule set with new patterns
   * 
   * @param config - New patterns to add
   */
  add(config: string[]): void {
    this.#ignore.add(config);
  }

  /**
   * Tests if a path should be ignored
   * Checks path against all configured ignore patterns
   * 
   * @param path - Path to test (relative to dataset root)
   * @returns True if path matches any ignore pattern
   */
  test(path: string): boolean {
    return this.#ignore.ignores(path);
  }
}