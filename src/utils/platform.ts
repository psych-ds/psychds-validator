// platform.ts

// Global declarations
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

    // Extend the Buffer interface to include methods we need across platforms
    interface Buffer extends Uint8Array {
        write(string: string, offset?: number, length?: number, encoding?: string): number;
        toString(encoding?: string, start?: number, end?: number): string;
        }

  }
  
  // Improved environment detection
  // deno-lint-ignore no-explicit-any
  export const isBrowser = typeof window !== 'undefined' && typeof (window as any).document !== 'undefined';
  // deno-lint-ignore no-node-globals
  export const isNode = typeof process !== 'undefined' && process.versions != null && process.versions.node != null;
  export const isDeno = typeof Deno !== 'undefined';
  
  // Path module
  // deno-lint-ignore no-explicit-any
  let _path: any;
  
  export const path = {
    resolve: (...paths: string[]) => _path ? _path.resolve(...paths) : paths.join('/'),
    basename: (path: string, ext?: string) => _path ? _path.basename(path, ext) : path.split('/').pop() || '',
    join: (...paths: string[]) => _path ? _path.join(...paths) : paths.join('/'),
    dirname: (path: string) => _path ? _path.dirname(path) : path.split('/').slice(0, -1).join('/'),
    sep: '/'
  };
  
  // Path separator
  export const SEP = '/';
  
  // EventEmitter
  // deno-lint-ignore no-explicit-any
  let EventEmitter: any;

  const browserLogger = {
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  };

  export const getLogger = () => {
    if (isBrowser) {
      return browserLogger;
    } else if (isNode) {
      // Use Winston for Node.js (you'll need to import Winston here)
      // return winston.createLogger({ ... });
    } else if (isDeno) {
      // Use Deno's console or a Deno-compatible logger
      return console;
    }
    // Fallback to console
    return console;
  };
  
  // Initialization function for all environments
  export async function initializePlatform() {
    if (isBrowser){
        // Browser or Web Worker environment
        _path = {
          resolve: (...paths: string[]) => paths.join('/'),
          basename: (path: string) => path.split('/').pop() || '',
          join: (...paths: string[]) => paths.join('/'),
          dirname: (path: string) => path.split('/').slice(0, -1).join('/'),
          sep: '/'
        };
        const EE3 = await import('https://cdn.skypack.dev/eventemitter3');
        EventEmitter = EE3.default;
      }
    else if (isNode) {
      const nodePath = await import('node:path');
      _path = nodePath;
      const nodeEvents = await import('node:events');
      EventEmitter = nodeEvents.EventEmitter;
    } else{
      const denoPath = await import('node:path');
      _path = denoPath;
      const denoEvents = await import('node:events');
      EventEmitter = denoEvents.EventEmitter;
    } 
  }
  
  // File reading
  export const readFile = async (filePath: string): Promise<string> => {
    if (isBrowser){
        const response = await fetch(filePath);
        return response.text();
      }
    else if (isNode) {
      const fs = await import('node:fs/promises');
      return fs.readFile(filePath, 'utf-8');
    } else  {
      return Deno.readTextFile(filePath);
    } 
  };
  
  // Directory reading
  export const readDir = async function* (dirPath: string): AsyncGenerator<{ name: string, isFile: boolean, isDirectory: boolean }> {
    if (isNode) {
      const fs = await import('node:fs/promises');
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
      throw new Error('Directory reading is not supported in the browser environment');
    }
  };
  
  // File stats
  export const getFileInfo = async (filePath: string): Promise<{ size: number }> => {
    if (isNode) {
      const fs = await import('node:fs/promises');
      const stats = await fs.stat(filePath);
      return { size: stats.size };
    } else if (isDeno) {
      const fileInfo = await Deno.stat(filePath);
      return { size: fileInfo.size };
    } else {
      throw new Error('File stats are not available in the browser environment');
    }
  };
  
  // Stream creation
  export const createReadStream = (filePath: string): ReadableStream<Uint8Array> => {
    if (isNode) {
      return new ReadableStream({
        async start(controller) {
          const fs = await import('node:fs');
          const readStream = fs.createReadStream(filePath);
          // deno-lint-ignore no-node-globals
          readStream.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
          readStream.on('end', () => controller.close());
          readStream.on('error', (error: Error) => controller.error(error));
        }
      });
    } else if (isDeno) {
      const file = Deno.openSync(filePath, { read: true });
      return file.readable;
    } else {
      // For browser environments, we'll use fetch
      return new ReadableStream({
        async start(controller) {
          try {
            const response = await fetch(filePath);
            if (!response.body) {
              throw new Error('No readable body in response');
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
        }
      });
    }
  };

  export {EventEmitter}
  