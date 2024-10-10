/**
 * Deno specific implementation for reading files
 */
import { path, readFile, createReadStream, isBrowser } from '../utils/platform.ts';
import { psychDSFile, issueInfo } from '../types/file.ts'
import { FileTree } from '../types/filetree.ts'
import { requestReadPermission } from '../setup/requestPermissions.ts'
import { readPsychDSIgnore, FileIgnoreRules } from './ignore.ts'

/**
 * Thrown when a text file is decoded as UTF-8 but contains UTF-16 characters
 */
export class UnicodeDecodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnicodeDecode'
  }
}

interface WebFile {
  text(): Promise<string>;
}

/**
 * Deno implementation of psychDSFile
 */
export class psychDSFileDeno implements psychDSFile {
  #ignore: FileIgnoreRules
  name: string
  path: string
  expanded: object
  issueInfo: issueInfo[]
  webFile: WebFile | null
  #fileInfo?: Deno.FileInfo
  #datasetAbsPath: string

  constructor(datasetPath: string, filePath: string, ignore: FileIgnoreRules) {
    this.#datasetAbsPath = datasetPath
    this.path = filePath
    this.name = path.basename(filePath)
    this.expanded = {}
    this.issueInfo = []
    this.#ignore = ignore
    this.webFile = null
    try {
      this.#fileInfo = Deno.statSync(this._getPath())
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.#fileInfo = Deno.lstatSync(this._getPath())
      }
    }
  }

  private _getPath(): string {
    return path.join(this.#datasetAbsPath, this.path)
  }

  get size(): number {
    return this.#fileInfo ? this.#fileInfo.size : -1
  }

  get stream(): ReadableStream<Uint8Array> {
    return createReadStream(this._getPath());
  }

  get ignored(): boolean {
    return this.#ignore.test(this.path)
  }

  /**
   * Read the entire file and decode as utf-8 text
   */
  async text(): Promise<string> {
    let data: string
    if (!isBrowser) {
      data = await readFile(this._getPath());
    } else if (this.webFile) {
      data = await this.webFile.text()
    } else {
      throw new Error('WebFile not set for browser environment')
    }
    if (data.startsWith('\uFFFD')) {
      throw new UnicodeDecodeError('This file appears to be UTF-16');
    }
    return data;
  }

  /**
   * Read bytes in a range efficiently from a given file
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
   * Return a Deno file handle
   */
  #openHandle(): Deno.FsFile {
    // Avoid asking for write access
    const openOptions = { read: true, write: false }
    return Deno.openSync(this._getPath(), openOptions)
  }
}

/* recursive function for readFileTree, crawls through dataset */
async function _readFileTree(
  // deno-lint-ignore no-explicit-any
  rootPathOrDict: string | { [key: string]: any },
  relativePath: string,
  ignore: FileIgnoreRules,
  parent?: FileTree,
  context?: object | null
): Promise<FileTree> {
  const name = path.basename(relativePath);
  const tree = new FileTree(relativePath, name, parent);

  if (typeof rootPathOrDict === 'string') {
    // Deno file system
    await requestReadPermission();
    for await (const dirEntry of Deno.readDir(path.join(rootPathOrDict, relativePath))) {
      if (dirEntry.isFile || dirEntry.isSymlink) {
        const file = new psychDSFileDeno(
          rootPathOrDict,
          path.join(relativePath, dirEntry.name),
          ignore,
        );

        if (dirEntry.name === '.psychdsignore') {
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
          context
        );
        tree.directories.push(dirTree);
      }
    }
  } else {

    // Browser-based file structure
    for (const key in rootPathOrDict) {
      const path = (relativePath === '/') ? `/${key}` : `${relativePath}/${key}`;

      if (rootPathOrDict[key]['type'] === 'file') {
        const file = new psychDSFileDeno('.', path, ignore);
        file.webFile = rootPathOrDict[key]['file']

        //file.fileText = rootPathOrDict[key]['text'].replace('http://schema.org', 'https://schema.org').replace('http://www.schema.org', 'https://schema.org');

        if (key === '.psychdsignore') {
          ignore.add(await readPsychDSIgnore(file));
        }
        tree.files.push(file);
      } else {
        const dirTree = await _readFileTree(rootPathOrDict[key]['contents'], path, ignore, tree, context);
        tree.directories.push(dirTree);
      }
    }
  }

  return tree;
}

/**
 * Read in the target directory structure and return a FileTree
 */
// deno-lint-ignore no-explicit-any
export function readFileTree(rootPathOrDict: string | { [key: string]: any }): Promise<FileTree> {
  const ignore = new FileIgnoreRules([]);
  return _readFileTree(rootPathOrDict, '/', ignore);
}

export {FileIgnoreRules as FileIgnoreRules}