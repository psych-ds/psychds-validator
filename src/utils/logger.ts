import { isBrowser } from "./platform.ts";

// Import winston types
import type { transport as WinstonTransport } from "npm:winston";

// Define the logger interface
export interface Logger {
  error: (message: string, ...meta: unknown[]) => void;
  warn: (message: string, ...meta: unknown[]) => void;
  info: (message: string, ...meta: unknown[]) => void;
  debug: (message: string, ...meta: unknown[]) => void;
  checklist: (message: string) => void;
  add?: (transport: unknown) => void;
}

export type LevelName = keyof Logger;

// Create a promise that resolves to the logger
const loggerPromise: Promise<Logger> = (async () => {
  if (isBrowser) {
    // Browser implementation (no-op)
    return {
      error: console.error,
      warn: console.warn,
      info: console.log,
      debug: console.log,
      checklist: console.log,
    };
  } else {
    // Node.js implementation (using Winston)
    const winston = await import("npm:winston");
    const { createLogger, format, transports } = winston;

    const winstonLogger = createLogger({
      level: "info",
      levels: {
        error: 0,
        warn: 1,
        info: 2,
        debug: 3,
        checklist: 4,
      },
      format: format.combine(
        format.timestamp(),
        // deno-lint-ignore no-explicit-any
        format.printf((info: any): string => {
          if (info.level === "checklist") {
            return info.message;
          }
          return `${info.timestamp} [${info.level.toUpperCase()}]: ${info.message} ${
            Object.keys(info).length > 3
              ? JSON.stringify(Object.assign({}, info, {
                timestamp: undefined,
                level: undefined,
                message: undefined,
              }))
              : ""
          }`;
        }),
      ),
      transports: [
        new transports.Console({
          level: "checklist",
        }),
      ],
    });

    // Create a logger object that matches our Logger interface
    const logger: Logger = {
      error: (message: string, ...meta: unknown[]) =>
        winstonLogger.error(message, ...meta),
      warn: (message: string, ...meta: unknown[]) =>
        winstonLogger.warn(message, ...meta),
      info: (message: string, ...meta: unknown[]) =>
        winstonLogger.info(message, ...meta),
      debug: (message: string, ...meta: unknown[]) =>
        winstonLogger.debug(message, ...meta),
      checklist: (message: string) => winstonLogger.log("checklist", message),
      add: (transport: unknown) =>
        winstonLogger.add(transport as WinstonTransport),
    };

    return logger;
  }
})();

// Export the logger promise for advanced usage
export { loggerPromise as logger };

// Async wrapper for logging functions
const createAsyncLogger =
  (level: keyof Logger) => async (message: string, ...meta: unknown[]) => {
    const logger = await loggerPromise;
    if (logger[level]) {
      logger[level](message, ...meta);
    }
  };

// Exports
export const error = createAsyncLogger("error");
export const warn = createAsyncLogger("warn");
export const info = createAsyncLogger("info");
export const debug = createAsyncLogger("debug");
export const checklist = createAsyncLogger("checklist");

export const LogLevels = {
  ERROR: "error" as const,
  WARN: "warn" as const,
  INFO: "info" as const,
  DEBUG: "debug" as const,
  CHECKLIST: "checklist" as const,
};

// Cursor manipulation methods (these will only work in Node.js environment)
export const cursor = {
  up: (n: number) => isBrowser ? undefined : console.log(`\x1b[${n}A`),
  clear: () => isBrowser ? undefined : console.log("\x1b[0J"),
  move: (x: number, y: number) =>
    isBrowser ? undefined : console.log(`\x1b[${y};${x}H`),
};

// Setup logging function (no-op in browser)
export const setupLogging = async (level: LevelName) => {
  if (!isBrowser) {
    const loggerInstance = await loggerPromise;
    // Assuming the Winston logger is accessible here
    // deno-lint-ignore no-explicit-any
    (loggerInstance as any).level = level;
  }
};
