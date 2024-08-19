import { psychDSFile } from "../types/file.ts";
import { Ignore, ignore } from "../deps/ignore.ts";

export function readPsychDSIgnore(file: psychDSFile) {
  const value = file.fileText;
  if (value) {
    const lines = value.split("\n");
    return lines;
  } else {
    return [];
  }
}

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
 * Deno implementation of .bidsignore style rules
 */
export class FileIgnoreRules {
  #ignore: Ignore;

  constructor(config: string[]) {
    this.#ignore = ignore({ allowRelativePaths: true });
    this.#ignore.add(defaultIgnores);
    this.#ignore.add(config);
  }

  add(config: string[]): void {
    this.#ignore.add(config);
  }

  /** Test if a dataset relative path should be ignored given configured rules */
  test(path: string): boolean {
    return this.#ignore.ignores(path);
  }
}
