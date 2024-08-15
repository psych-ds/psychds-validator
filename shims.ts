// shims.ts
// This file provides shims for APIs that are available in Deno but not in Node.js

// Import the ReadableStream from Node.js's web streams API
import { ReadableStream } from 'node:stream/web';

// Extend the global type definition to include ReadableStream
// This ensures TypeScript recognizes ReadableStream as a global
declare global {
    interface globalThis {
        ReadableStream: typeof ReadableStream;
    }
}

// Export ReadableStream so it can be used as a shim in the build process
export { ReadableStream };