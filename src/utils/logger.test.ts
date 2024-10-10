import { assertEquals, assert } from '../deps/asserts.ts';
import { setupLogging, logger, LogLevels, error, warn, info, debug, LevelName } from './logger.ts';
import winston from 'npm:winston';
import TransportStream from 'npm:winston-transport';

class MemoryTransport extends TransportStream {
  private logs: string[] = [];

  constructor(opts?: TransportStream.TransportStreamOptions) {
    super(opts);
    this.level = 'checklist';  // Set to the highest level to capture all logs
  }

  log(info: winston.LogEntry, callback: () => void): void {
    if (typeof info === 'object' && info !== null && 'message' in info) {
      this.logs.push(info.message as string);
    } else {
      this.logs.push(String(info));
    }
    callback();
  }

  clearLogs(): void {
    this.logs = [];
  }

  readLogs(): string[] {
    return this.logs;
  }
}

const testTransport = new MemoryTransport();

async function setupTestLogger() {
  const loggerInstance = await logger;
  if ('add' in loggerInstance && typeof loggerInstance.add === 'function') {
    loggerInstance.add(testTransport);
  } else {
    console.warn('Logger does not support adding transports');
  }
}

function clearTestLogs() {
  testTransport.clearLogs();
}

function getTestLogs() {
  return testTransport.readLogs();
}

function waitForLogs(timeout = 100): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, timeout);
  });
}

Deno.test({
  name: 'Logger functionality', 
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    await setupTestLogger();

    await t.step('setupLogging function', async () => {
      const levels: LevelName[] = ['error', 'warn', 'info', 'debug', 'checklist'];
      for (const level of levels) {
        await setupLogging(level);
        const loggerInstance = await logger;
        if (typeof loggerInstance[level] === 'function') {
          loggerInstance[level]('Test message');
        }
        await waitForLogs();
        const logs = getTestLogs();
        assert(logs.length > 0, `Should log a message for ${level} level`);
        assert(logs.some(log => log.includes('Test message')), `Log should contain the test message for ${level} level`);
        clearTestLogs();
      }
    });

    await t.step('logger proxy and log methods', async () => {
      const logMethods = [error, warn, info, debug];

      for (const logMethod of logMethods) {
        clearTestLogs();
        await logMethod('Test message');
        await waitForLogs();
        const logs = getTestLogs();
        assert(logs.length > 0, `Log should produce output`);
        assert(logs.some(log => log.includes('Test message')), `Log should contain the test message`);
      }
    });

    await t.step('LogLevels enum', () => {
      assertEquals(LogLevels.ERROR, 'error', 'LogLevels.ERROR should be "error"');
      assertEquals(LogLevels.WARN, 'warn', 'LogLevels.WARN should be "warn"');
      assertEquals(LogLevels.INFO, 'info', 'LogLevels.INFO should be "info"');
      assertEquals(LogLevels.DEBUG, 'debug', 'LogLevels.DEBUG should be "debug"');
      assertEquals(LogLevels.CHECKLIST, 'checklist', 'LogLevels.CHECKLIST should be "checklist"');
    });

    await t.step('logger.debug with message', async () => {
      clearTestLogs();
      await debug('Debug message');
      await waitForLogs();
      const logs = getTestLogs();
      assert(logs.length > 0, 'Debug log should produce output');
      assert(logs.some(log => log.includes('Debug message')), 'Debug message should be logged');
    });
  }
});