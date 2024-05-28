/**
 * Deno specific implementation for reading files
 */
import { join, basename } from '../deps/path.ts'
import { psychDSFile, issueInfo } from '../types/file.ts'
import { FileTree } from '../types/filetree.ts'
import { requestReadPermission } from '../setup/requestPermissions.ts'
import { readPsychDSIgnore, FileIgnoreRules } from './ignore.ts'
import jsonld from "npm:jsonld@8.3.2";

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
          .replaceAll('https://schema.org','http://schema.org')
          .replaceAll('https://www.schema.org','http://www.schema.org')
  
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
        .replaceAll('https://schema.org','http://schema.org')
        .replaceAll('https://www.schema.org','http://www.schema.org')

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
          exp = await jsonld.expand(json)
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