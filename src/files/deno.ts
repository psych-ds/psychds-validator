/**
 * Deno specific implementation for reading files
 */
import { join, basename } from '../deps/path.ts'
import { psychDSFile, issueInfo } from '../types/file.ts'
import { FileTree } from '../types/filetree.ts'
import { requestReadPermission } from '../setup/requestPermissions.ts'
import { readPsychDSIgnore, FileIgnoreRules } from './ignore.ts'
import jsonld from "jsonld";

/**
 * Custom document loader for JSON-LD contexts.
 * 
 * This function fetches JSON-LD context documents from a given URL. It includes
 * special handling for schema.org URLs, redirecting them to the specific JSON-LD
 * context URL. The function performs content type checking to ensure the response
 * is valid JSON-LD or JSON.
 *
 * @param {string} url - The URL of the JSON-LD context document to load.
 * @returns {Promise<{contextUrl: null, documentUrl: string, document: any}>} 
 *          A promise that resolves to an object containing:
 *          - contextUrl: Always null in this implementation.
 *          - documentUrl: The final URL of the fetched document.
 *          - document: The parsed JSON-LD context.
 * @throws {Error} If the content type of the response is not application/ld+json or application/json.
 */
const customDocumentLoader = async (url: string) => {
  // Special handling for schema.org URLs
  if (url === "https://schema.org/" || url === "http://schema.org/") {
    // Redirect to the specific JSON-LD context URL for schema.org
    url = "https://schema.org/docs/jsonldcontext.json";
  }

  // Fetch the document with appropriate headers
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/ld+json, application/json'
    },
    redirect: 'follow' // Allow redirects
  });

  // Check the content type of the response
  const contentType = response.headers.get('content-type');
  if (!contentType || !(contentType.includes('application/ld+json') || contentType.includes('application/json'))) {
    throw new Error(`Unexpected content type: ${contentType}`);
  }

  // Parse the JSON response
  const document = await response.json();

  // Return the document in the format expected by JSON-LD processors
  return {
    contextUrl: null, // Not used in this implementation
    documentUrl: url, // The final URL after any redirects
    document: document // The parsed JSON-LD context
  };
};


/**
 * Thrown when a text file is decoded as UTF-8 but contains UTF-16 characters
 */
export class UnicodeDecodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnicodeDecode'
  }
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
  fileText: string
  #fileInfo?: Deno.FileInfo
  #datasetAbsPath: string

  constructor(datasetPath: string, path: string, ignore: FileIgnoreRules) {
    this.#datasetAbsPath = datasetPath
    this.path = path
    this.name = basename(path)
    this.fileText = ''
    this.expanded = {}
    this.issueInfo = []
    this.#ignore = ignore
    try {
      this.#fileInfo = Deno.statSync(this._getPath())
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.#fileInfo = Deno.lstatSync(this._getPath())
      }
    }
  }

  private _getPath(): string {
    return join(this.#datasetAbsPath, this.path)
  }

  get size(): number {
    return this.#fileInfo ? this.#fileInfo.size : -1
  }

  get stream(): ReadableStream<Uint8Array> {
    const handle = this.#openHandle()
    return handle.readable
  }

  get ignored(): boolean {
    return this.#ignore.test(this.path)
  }

  /**
   * Read the entire file and decode as utf-8 text
   */
  async text(): Promise<string> {
    const streamReader = this.stream
      .pipeThrough(new TextDecoderStream('utf-8'))
      .getReader()
    let data = ''
    try {
      // Read once to check for unicode issues
      const { done, value } = await streamReader.read()
      // Check for UTF-16 BOM
      if (value && value.startsWith('\uFFFD')) {
        throw new UnicodeDecodeError('This file appears to be UTF-16')
      }
      if (done) return data
      data += value
      // Continue reading the rest of the file if no unicode issues were found
      while (true) {
        const { done, value } = await streamReader.read()
        if (done) return data
        data += value
      }
    } finally {
      streamReader.releaseLock()
    }
  }

  /**
   * Read bytes in a range efficiently from a given file
   */
  async readBytes(size: number, offset = 0): Promise<Uint8Array> {
    const handle = this.#openHandle()
    const buf = new Uint8Array(size)
    await handle.seek(offset, Deno.SeekMode.Start)
    await handle.read(buf)
    handle.close()
    return buf
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
export async function _readFileTree(
  rootPath: string,
  relativePath: string,
  ignore: FileIgnoreRules,
  parent?: FileTree,
  context?: object | null
): Promise<FileTree> {
  await requestReadPermission()
  const name = basename(relativePath)
  const tree = new FileTree(relativePath, name, parent)

  if(!parent){
    for await (const dirEntry of Deno.readDir(join(rootPath,relativePath))){
      if(dirEntry.isFile && dirEntry.name === "dataset_description.json"){
        const file = new psychDSFileDeno(
          rootPath,
          join(relativePath, dirEntry.name),
          ignore,
        )
  
        file.fileText = (await file.text())
          .replaceAll('http://schema.org','https://schema.org')
          .replaceAll('http://www.schema.org','https://www.schema.org')
  
        const json = await JSON.parse(file.fileText)
  
        if('@context' in json){
          context = json['@context'] as object
        }
      }
    }
  }
  
  
  for await (const dirEntry of Deno.readDir(join(rootPath, relativePath))) {
    if (dirEntry.isFile || dirEntry.isSymlink) {
      const file = new psychDSFileDeno(
        rootPath,
        join(relativePath, dirEntry.name),
        ignore,
      )
      //store text of file for later. This was added to accommodate browser version
      file.fileText = (await file.text())
        .replaceAll('http://schema.org','https://schema.org')
        .replaceAll('http://www.schema.org','https://www.schema.org')

      // For .psychdsignore, read in immediately and add the rules
      if (dirEntry.name === '.psychdsignore') {
        ignore.add(readPsychDSIgnore(file))
      }
      if (dirEntry.name.endsWith('.json')) {
        let json = {}
        let exp = []
        try{
          json = await JSON.parse(file.fileText)
          if (context && !dirEntry.name.endsWith('dataset_description.json')){
            json = {
              ...json,
              '@context': context
            }
          }
        }
        catch(_error){
          file.issueInfo.push({
            key: 'InvalidJsonFormatting'
          })
        }
        
        try{
          exp = await jsonld.expand(json, {
            documentLoader: customDocumentLoader
        })
          if (exp.length > 0)
            file.expanded = exp[0]
        }
        catch(error){
          file.issueInfo.push({
            key: 'InvalidJsonldSyntax',
            evidence: `${error.message.split(';')[1]}`
          })
        }
      }
      tree.files.push(file)
    }
    if (dirEntry.isDirectory) {
      const dirTree = await _readFileTree(
        rootPath,
        join(relativePath, dirEntry.name),
        ignore,
        tree,
        context
      )
      tree.directories.push(dirTree)
    }
  }
  return tree
}

/**
 * Read in the target directory structure and return a FileTree
 */
export function readFileTree(rootPath: string): Promise<FileTree> {
  const ignore = new FileIgnoreRules([])
  return _readFileTree(rootPath, '/', ignore)
}

export {FileIgnoreRules as FileIgnoreRules}