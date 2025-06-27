/**
 * @fileoverview Platform abstraction layer that provides consistent APIs across different JavaScript environments
 * (Browser, Node.js, and Deno). This module handles environment detection and provides unified interfaces
 * for common operations like file handling, path manipulation, and event emission.
 */

// Global type declarations for cross-platform compatibility
import process from "node:process";
declare global {
  interface Window {
    process?: NodeJS.Process;
  }

  interface NodeJS {
    process: {
      versions: {
        node: string;
      };
    };
  }
  // deno-lint-ignore no-var
  var process: NodeJS.Process;

  /**
   * Extended Buffer interface to ensure consistent buffer operations across platforms
   */
  // @ts-ignore: Buffer/Uint8Array type compatibility issue
  interface Buffer extends Uint8Array {
    write(
      string: string,
      offset?: number,
      length?: number,
      encoding?: string,
    ): number;
    toString(encoding?: string, start?: number, end?: number): string;
  }
}

/**
 * Environment detection flags
 * These constants help determine the current runtime environment
 */
export const isBrowser = typeof window !== "undefined" &&
  // deno-lint-ignore no-explicit-any
  typeof (window as any).document !== "undefined";

export const isNode = typeof process !== "undefined" &&
  process.versions != null && process.versions.node != null;

export const isDeno = typeof Deno !== "undefined";

/**
 * Path utilities that work consistently across platforms
 * Provides a unified interface for path operations regardless of environment
 */
// deno-lint-ignore no-explicit-any
let _path: any;

export const path = {
  /** Resolves a sequence of paths into an absolute path */
  resolve: (...paths: string[]) =>
    _path ? _path.resolve(...paths) : paths.join("/"),

  /** Gets the last portion of a path */
  basename: (path: string, ext?: string) =>
    _path ? _path.basename(path, ext) : path.split("/").pop() || "",

  /** Joins all given path segments together */
  join: (...paths: string[]) => _path ? _path.join(...paths) : paths.join("/"),

  /** Returns the directory name of a path */
  dirname: (path: string) =>
    _path ? _path.dirname(path) : path.split("/").slice(0, -1).join("/"),

  /** Platform-independent path separator */
  sep: "/",
};

/** Standard path separator used across all environments */
export const SEP = "/";

/** Event emitter class that will be initialized based on environment */
// deno-lint-ignore no-explicit-any
let EventEmitter: any;

/**
 * Browser-specific logger implementation
 * Provides consistent logging interface in browser environments
 */
const browserLogger = {
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
};

/**
 * Returns appropriate logger instance for current environment
 * @returns Logger interface appropriate for the current platform
 */
export const getLogger = () => {
  if (isBrowser) {
    return browserLogger;
  } else if (isNode) {
    // Winston logger would be configured here for Node.js
    // return winston.createLogger({ ... });
  } else if (isDeno) {
    return console;
  }
  return console;
};

/**
 * Initializes platform-specific implementations
 * Sets up path utilities and event emitter based on current environment
 */
export async function initializePlatform() {
  if (isBrowser) {
    // Browser environment setup
    _path = {
      resolve: (...paths: string[]) => paths.join("/"),
      basename: (path: string) => path.split("/").pop() || "",
      join: (...paths: string[]) => paths.join("/"),
      dirname: (path: string) => path.split("/").slice(0, -1).join("/"),
      sep: "/",
    };
    const EE3 = await import("./eventemitter3.ts");
    EventEmitter = EE3.default;
  } else if (isNode) {
    // Node.js environment setup
    const nodePath = await import("node:path");
    _path = nodePath;
    const nodeEvents = await import("node:events");
    EventEmitter = nodeEvents.EventEmitter;
  } else {
    // Deno environment setup
    const denoPath = await import("node:path");
    _path = denoPath;
    const denoEvents = await import("node:events");
    EventEmitter = denoEvents.EventEmitter;
  }
}

/**
 * Reads a file's contents as text
 * @param filePath - Path to the file to read
 * @returns Promise resolving to file contents as string
 */
export const readFile = async (filePath: string): Promise<string> => {
  if (isBrowser) {
    const response = await fetch(filePath);
    return response.text();
  } else if (isNode) {
    const fs = await import("node:fs/promises");
    return fs.readFile(filePath, "utf-8");
  } else {
    return Deno.readTextFile(filePath);
  }
};

/**
 * Reads directory contents
 * @param dirPath - Path to directory to read
 * @yields Objects containing file/directory information
 */
export const readDir = async function* (
  dirPath: string,
): AsyncGenerator<{ name: string; isFile: boolean; isDirectory: boolean }> {
  if (isNode) {
    const fs = await import("node:fs/promises");
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      yield {
        name: entry.name,
        isFile: entry.isFile(),
        isDirectory: entry.isDirectory(),
      };
    }
  } else if (isDeno) {
    for await (const entry of Deno.readDir(dirPath)) {
      yield {
        name: entry.name,
        isFile: entry.isFile,
        isDirectory: entry.isDirectory,
      };
    }
  } else {
    throw new Error(
      "Directory reading is not supported in the browser environment",
    );
  }
};

/**
 * Gets file information/stats
 * @param filePath - Path to file to get info about
 * @returns Promise resolving to object containing file size
 */
export const getFileInfo = async (
  filePath: string,
): Promise<{ size: number }> => {
  if (isNode) {
    const fs = await import("node:fs/promises");
    const stats = await fs.stat(filePath);
    return { size: stats.size };
  } else if (isDeno) {
    const fileInfo = await Deno.stat(filePath);
    return { size: fileInfo.size };
  } else {
    throw new Error("File stats are not available in the browser environment");
  }
};

/**
 * Creates a readable stream from a file
 * Provides consistent streaming interface across platforms
 * @param filePath - Path to file to stream
 * @returns ReadableStream of file contents
 */
export const createReadStream = (
    filePath: string,
  ): ReadableStream<Uint8Array> => {
    if (isNode) {
      return new ReadableStream({
        async start(controller) {
          const fs = await import("node:fs");
          const readStream = fs.createReadStream(filePath);
          
          readStream.on('data', (chunk: unknown) => {
            if (chunk instanceof Uint8Array) {
              controller.enqueue(chunk);
            } else if (typeof chunk === 'string') {
              controller.enqueue(new TextEncoder().encode(chunk));
            } else {
              // Handle any other type that might come through
              // Convert to string and then to Uint8Array
              controller.enqueue(new TextEncoder().encode(String(chunk)));
            }
          });
          
          readStream.on("end", () => controller.close());
          readStream.on("error", (error: Error) => controller.error(error));
        },
      });
    } else if (isDeno) {
      const file = Deno.openSync(filePath, { read: true });
      return file.readable;
    } else {
      // Browser implementation using fetch
      return new ReadableStream({
        async start(controller) {
          try {
            const response = await fetch(filePath);
            if (!response.body) {
              throw new Error("No readable body in response");
            }
            const reader = response.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      });
    }
  };

export { EventEmitter };
