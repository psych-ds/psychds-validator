/**
 * Deno specific implementation for reading files
 */
import path from "node:path";
import { issueInfo, psychDSFile } from "../types/file.ts";
import { FileTree } from "../types/filetree.ts";
import { requestReadPermission } from "../setup/requestPermissions.ts";
import { FileIgnoreRules, readPsychDSIgnore } from "./ignore.ts";
import jsonld from "jsonld";

/**
 * Thrown when a text file is decoded as UTF-8 but contains UTF-16 characters
 */
export class UnicodeDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnicodeDecode";
  }
}

/**
 * Deno implementation of psychDSFile
 */
export class psychDSFileDeno implements psychDSFile {
  #ignore: FileIgnoreRules;
  name: string;
  path: string;
  expanded: object;
  issueInfo: issueInfo[];
  fileText: string;
  #fileInfo?: Deno.FileInfo;
  #datasetAbsPath: string;

  constructor(datasetPath: string, filePath: string, ignore: FileIgnoreRules) {
    this.#datasetAbsPath = datasetPath;
    this.path = filePath;
    this.name = path.basename(filePath);
    this.fileText = "";
    this.expanded = {};
    this.issueInfo = [];
    this.#ignore = ignore;
    try {
      this.#fileInfo = Deno.statSync(this._getPath());
    } catch (error) {
      if (error.code === "ENOENT") {
        this.#fileInfo = Deno.lstatSync(this._getPath());
      }
    }
  }

  private _getPath(): string {
    return path.join(this.#datasetAbsPath, this.path);
  }

  get size(): number {
    return this.#fileInfo ? this.#fileInfo.size : -1;
  }

  get stream(): ReadableStream<Uint8Array> {
    const handle = this.#openHandle();
    return handle.readable;
  }

  get ignored(): boolean {
    return this.#ignore.test(this.path);
  }

  /**
   * Read the entire file and decode as utf-8 text
   */
  async text(): Promise<string> {
    const stream = this.stream;
    const decoder = new TextDecoder("utf-8");
    let data = "";
    try {
      // Read the stream chunk by chunk and decode
      for await (const chunk of stream) {
        const value = decoder.decode(chunk, { stream: true });
        // Check for UTF-16 BOM at the start of the file
        if (data.length === 0 && value.startsWith("\uFFFD")) {
          throw new UnicodeDecodeError("This file appears to be UTF-16");
        }
        data += value;
      }
    } finally {
      // Ensure the decoder is flushed even if an error occurs
      // This prevents resource leaks and ensures all data is processed
      data += decoder.decode();
    }
    return data;
  }

  /**
   * Read bytes in a range efficiently from a given file
   */
  async readBytes(size: number, offset = 0): Promise<Uint8Array> {
    const handle = this.#openHandle();
    const buf = new Uint8Array(size);
    await handle.seek(offset, Deno.SeekMode.Start);
    await handle.read(buf);
    handle.close();
    return buf;
  }

  /**
   * Return a Deno file handle
   */
  #openHandle(): Deno.FsFile {
    // Avoid asking for write access
    const openOptions = { read: true, write: false };
    return Deno.openSync(this._getPath(), openOptions);
  }
}

/* recursive function for readFileTree, crawls through dataset */
export async function _readFileTree(
  rootPath: string,
  relativePath: string,
  ignore: FileIgnoreRules,
  parent?: FileTree,
  context?: object | null,
): Promise<FileTree> {
  await requestReadPermission();
  const name = path.basename(relativePath);
  const tree = new FileTree(relativePath, name, parent);

  if (!parent) {
    for await (
      const dirEntry of Deno.readDir(path.join(rootPath, relativePath))
    ) {
      if (dirEntry.isFile && dirEntry.name === "dataset_description.json") {
        const file = new psychDSFileDeno(
          rootPath,
          path.join(relativePath, dirEntry.name),
          ignore,
        );

        file.fileText = (await file.text())
          .replaceAll("https://schema.org", "http://schema.org")
          .replaceAll("https://www.schema.org", "http://www.schema.org");

        const json = await JSON.parse(file.fileText);

        if ("@context" in json) {
          context = json["@context"] as object;
        }
      }
    }
  }

  for await (
    const dirEntry of Deno.readDir(path.join(rootPath, relativePath))
  ) {
    if (dirEntry.isFile || dirEntry.isSymlink) {
      const file = new psychDSFileDeno(
        rootPath,
        path.join(relativePath, dirEntry.name),
        ignore,
      );
      //store text of file for later. This was added to accommodate browser version
      file.fileText = (await file.text())
        .replaceAll("https://schema.org", "http://schema.org")
        .replaceAll("https://www.schema.org", "http://www.schema.org");

      // For .psychdsignore, read in immediately and add the rules
      if (dirEntry.name === ".psychdsignore") {
        ignore.add(readPsychDSIgnore(file));
      }
      if (dirEntry.name.endsWith(".json")) {
        let json = {};
        let exp = [];
        try {
          json = await JSON.parse(file.fileText);
          if (context && !dirEntry.name.endsWith("dataset_description.json")) {
            json = {
              ...json,
              "@context": context,
            };
          }
        } catch (_error) {
          file.issueInfo.push({
            key: "InvalidJsonFormatting",
          });
        }

        try {
          exp = await jsonld.expand(json);
          if (exp.length > 0) {
            file.expanded = exp[0];
          }
        } catch (error) {
          file.issueInfo.push({
            key: "InvalidJsonldSyntax",
            evidence: `${error.message.split(";")[1]}`,
          });
        }
      }
      tree.files.push(file);
    }
    if (dirEntry.isDirectory) {
      const dirTree = await _readFileTree(
        rootPath,
        path.join(relativePath, dirEntry.name),
        ignore,
        tree,
        context,
      );
      tree.directories.push(dirTree);
    }
  }
  return tree;
}

/**
 * Read in the target directory structure and return a FileTree
 */
export function readFileTree(rootPath: string): Promise<FileTree> {
  const ignore = new FileIgnoreRules([]);
  return _readFileTree(rootPath, "/", ignore);
}

export { FileIgnoreRules as FileIgnoreRules };
