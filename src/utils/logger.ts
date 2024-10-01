// logger.ts, re-written to accommodate winston rather than Deno logger
import winston from 'npm:winston';

const { createLogger, format, transports } = winston;

/**
 * Defines the valid log levels for the application.
 */
export type LevelName = 'error' | 'warn' | 'info' | 'debug' | 'checklist';

/**
 * Create a Winston logger instance with custom formatting.
 * The logger outputs to the console with timestamp, level, and message.
 */
const logger = createLogger({
  level: 'info',
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    checklist: 4
  },
  format: format.combine(
    format.timestamp(),
    format.printf(({ timestamp, level, message, ...rest }) => {
      if (level === 'checklist') {
        // For checklist, just return the message without timestamp or level
        return message;
      }
      return `${timestamp} [${level.toUpperCase()}]: ${message} ${Object.keys(rest).length ? JSON.stringify(rest) : ''}`;
    })
  ),
  transports: [
    new transports.Console({
      level: 'checklist'
    })
  ]
});

/**
 * Sets up the logging level for the application.
 * @param level - The desired logging level
 */
export function setupLogging(level: LevelName) {
  logger.level = level;
  logger.transports[0].level = level; 
}

/**
 * Parses the stack trace to extract the caller's location.
 * @param stack - The stack trace string
 * @returns The caller's location or an empty string if not found
 */
export function parseStack(stack: string) {
  const lines = stack.split('\n');
  const caller = lines[2]?.trim() ?? '';
  const token = caller.split('at ');
  return token[1] ?? '';
}

// Cursor manipulation methods
const cursorUp = (n: number) => console.log(`\x1b[${n}A`);
const clearScreen = () => console.log('\x1b[0J');
const moveCursor = (x: number, y: number) => console.log(`\x1b[${y};${x}H`);

/**
 * Defines the structure of a logging method.
 */
type LogMethod = (message: string, ...meta: unknown[]) => void;

/**
 * Defines the interface for the logger object.
 */
interface LoggerInterface {
  [key: string]: LogMethod;
  error: LogMethod;
  warn: LogMethod;
  info: LogMethod;
  debug: LogMethod;
  checklist: LogMethod;
}

/**
 * Proxy handler for the logger object.
 * It adds the caller's location to debug logs and handles non-existent log methods.
 */
const loggerProxyHandler: ProxyHandler<winston.Logger> = {
  get(_target: winston.Logger, prop: string | symbol): LogMethod {
    return (...args: [string, ...unknown[]]) => {
      // Add debug information about the caller's location
      const stack = new Error().stack;
      if (stack) {
        const callerLocation = parseStack(stack);
        logger.debug(`Logger invoked at "${callerLocation}"`);
      }
      
      // Call the appropriate logging method or default to warning
      if (typeof prop === 'string' && prop in logger) {
        (logger[prop as keyof typeof logger] as LogMethod)(...args);
      } else {
        logger.warn(...args); // Default to warning if the method doesn't exist
      }
    };
  },
};

/**
 * Create a proxied version of the logger to add additional functionality.
 */
const proxyLogger = new Proxy(logger, loggerProxyHandler);

/**
 * Export the proxied logger as the main logger object.
 */
export { proxyLogger as logger };

/**
 * Log levels enum.
 * Exported to maintain compatibility with existing code.
 */
export const LogLevels = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
  CHECKLIST: 'checklist'
};

/**
 * Convenience exports for individual log levels.
 * These allow direct usage of log methods without accessing the logger object.
 */
export const error = proxyLogger.error;
export const warn = proxyLogger.warn;
export const info = proxyLogger.info;
export const debug = proxyLogger.debug;
export const checklist = (message: string) => {
  logger.log('checklist', message);
};

export const cursor = {
  up: cursorUp,
  clear: clearScreen,
  move: moveCursor,
};