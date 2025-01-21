/**
 * @fileoverview Provides Deno-specific file system operations for the Psych-DS validator.
 * Implements file reading, directory traversal, and file tree construction with
 * support for both filesystem and browser-based operations.
 */

import {
  createReadStream,
  isBrowser,
  path,
  readFile,
} from "../utils/platform.ts";
import { issueInfo, psychDSFile } from "../types/file.ts";
import { FileTree } from "../types/filetree.ts";
import { requestReadPermission } from "../setup/requestPermissions.ts";
import { FileIgnoreRules, readPsychDSIgnore } from "./ignore.ts";

/**
 * Custom error for UTF-16 character detection in UTF-8 decoding
 * Thrown when a text file contains unexpected Unicode encodings
 */
export class UnicodeDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnicodeDecode";
  }
}

/** Represents a browser-compatible file interface */
interface WebFile {
  text(): Promise<string>;
}

/**
 * Implements psychDSFile interface for Deno environment
 * Handles file operations with proper permission management and error handling
 */
export class psychDSFileDeno implements psychDSFile {
  /** File ignore rules */
  #ignore: FileIgnoreRules;
  /** File name */
  name: string;
  /** File path relative to dataset root */
  path: string;
  /** Expanded metadata */
  expanded: object;
  /** Collection of validation issues */
  issueInfo: issueInfo[];
  /** Browser file interface when running in browser */
  webFile: WebFile | null;
  /** Cached file information */
  #fileInfo?: Deno.FileInfo;
  /** Absolute path to dataset root */
  #datasetAbsPath: string;

  /**
   * Creates a new Deno file instance
   * @param datasetPath - Path to dataset root
   * @param filePath - Relative path to file
   * @param ignore - Ignore rules to apply
   */
  constructor(datasetPath: string, filePath: string, ignore: FileIgnoreRules) {
    this.#datasetAbsPath = datasetPath;
    this.path = filePath;
    this.name = path.basename(filePath);
    this.expanded = {};
    this.issueInfo = [];
    this.#ignore = ignore;
    this.webFile = null;
    try {
      this.#fileInfo = Deno.statSync(this._getPath());
    } catch (error) {
      // deno-lint-ignore no-explicit-any
      if ((error as unknown as any).code === "ENOENT") {
        this.#fileInfo = Deno.lstatSync(this._getPath());
      }
    }
  }

  /**
   * Gets absolute path to file
   * @returns Absolute file system path
   * @private
   */
  private _getPath(): string {
    return path.join(this.#datasetAbsPath, this.path);
  }

  /** Gets file size in bytes */
  get size(): number {
    return this.#fileInfo ? this.#fileInfo.size : -1;
  }

  /** Gets readable stream of file content */
  get stream(): ReadableStream<Uint8Array> {
    return createReadStream(this._getPath());
  }

  /** Checks if file should be ignored */
  get ignored(): boolean {
    return this.#ignore.test(this.path);
  }

  /**
   * Reads entire file as UTF-8 text
   * Checks for and handles UTF-16 encoding detection
   * @returns Promise resolving to file content
   * @throws {UnicodeDecodeError} If file appears to be UTF-16 encoded
   */
  async text(): Promise<string> {
    let data: string;
    if (!isBrowser) {
      data = await readFile(this._getPath());
    } else if (this.webFile) {
      data = await this.webFile.text();
    } else {
      throw new Error("WebFile not set for browser environment");
    }
    if (data.startsWith("\uFFFD")) {
      throw new UnicodeDecodeError("This file appears to be UTF-16");
    }
    return data;
  }

  /**
   * Reads bytes from file in specified range
   * Efficiently handles large files through streaming
   *
   * @param size - Number of bytes to read
   * @param _offset - Start position (currently unused)
   * @returns Promise resolving to byte array
   */
  async readBytes(size: number, _offset = 0): Promise<Uint8Array> {
    const stream = this.stream;
    const reader = stream.getReader();
    const result = new Uint8Array(size);
    let bytesRead = 0;

    while (bytesRead < size) {
      const { value, done } = await reader.read();
      if (done) break;

      const remaining = size - bytesRead;
      const chunk = value.slice(0, remaining);
      result.set(chunk, bytesRead);
      bytesRead += chunk.length;
    }

    reader.releaseLock();
    return result;
  }

  /**
   * Opens a Deno file handle with read-only access
   * @returns Deno file handle
   * @private
   */
  #openHandle(): Deno.FsFile {
    const openOptions = { read: true, write: false };
    return Deno.openSync(this._getPath(), openOptions);
  }
}

/**
 * Recursively builds file tree structure
 * Handles both filesystem and browser-based directory traversal
 *
 * @param rootPathOrDict - Root path or browser file dictionary
 * @param relativePath - Current path relative to root
 * @param ignore - Ignore rules to apply
 * @param parent - Parent directory node
 * @param context - Optional context object
 * @returns Promise resolving to file tree structure
 */
async function _readFileTree(
  // deno-lint-ignore no-explicit-any
  rootPathOrDict: string | { [key: string]: any },
  relativePath: string,
  ignore: FileIgnoreRules,
  parent?: FileTree,
  context?: object | null,
): Promise<FileTree> {
  const name = path.basename(relativePath);
  const tree = new FileTree(relativePath, name, parent);

  if (typeof rootPathOrDict === "string") {
    // Filesystem-based traversal
    await requestReadPermission();
    for await (
      const dirEntry of Deno.readDir(path.join(rootPathOrDict, relativePath))
    ) {
      if (dirEntry.isFile || dirEntry.isSymlink) {
        const file = new psychDSFileDeno(
          rootPathOrDict,
          path.join(relativePath, dirEntry.name),
          ignore,
        );

        if (dirEntry.name === ".psychds-ignore") {
          ignore.add(await readPsychDSIgnore(file));
        }

        tree.files.push(file);
      }
      if (dirEntry.isDirectory) {
        const dirTree = await _readFileTree(
          rootPathOrDict,
          path.join(relativePath, dirEntry.name),
          ignore,
          tree,
          context,
        );
        tree.directories.push(dirTree);
      }
    }
  } else {
    // Browser-based traversal
    for (const key in rootPathOrDict) {
      const path = (relativePath === "/")
        ? `/${key}`
        : `${relativePath}/${key}`;

      if (rootPathOrDict[key]["type"] === "file") {
        const file = new psychDSFileDeno(".", path, ignore);
        file.webFile = rootPathOrDict[key]["file"];

        if (key === ".psychds-ignore") {
          ignore.add(await readPsychDSIgnore(file));
        }
        tree.files.push(file);
      } else {
        const dirTree = await _readFileTree(
          rootPathOrDict[key]["contents"],
          path,
          ignore,
          tree,
          context,
        );
        tree.directories.push(dirTree);
      }
    }
  }

  return tree;
}

/**
 * Reads directory structure and creates file tree
 * Public interface for file tree construction
 *
 * @param rootPathOrDict - Root path or browser file dictionary
 * @returns Promise resolving to complete file tree
 */
export function readFileTree(
  // deno-lint-ignore no-explicit-any
  rootPathOrDict: string | { [key: string]: any },
): Promise<FileTree> {
  const ignore = new FileIgnoreRules([]);
  return _readFileTree(rootPathOrDict, "/", ignore);
}

export { FileIgnoreRules as FileIgnoreRules };
