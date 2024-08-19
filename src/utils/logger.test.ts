import { assert, assertEquals } from "../deps/asserts.ts";
import {
  debug,
  error,
  info,
  logger,
  LogLevels,
  parseStack,
  setupLogging,
  warn,
} from "./logger.ts";
import { LevelName } from "./logger.ts";
import winston from "npm:winston";
import TransportStream from "npm:winston-transport";

/**
 * MemoryTransport is a custom Winston transport that stores logs in memory.
 * This is useful for testing as it allows us to capture and inspect logs
 * without writing to a file or console.
 */
class MemoryTransport extends TransportStream {
  private logs: string[] = [];

  constructor(opts?: TransportStream.TransportStreamOptions) {
    super(opts);
    this.level = "debug";
  }

  log(info: winston.LogEntry, callback: () => void): void {
    setTimeout(() => {
      this.emit("logged", info);
    }, 0);

    let message: string;
    if (typeof info === "string") {
      message = info;
    } else if (info && typeof info === "object") {
      if ("message" in info && typeof info.message === "string") {
        message = info.message;
      } else {
        message = JSON.stringify(info);
      }
    } else {
      message = String(info);
    }

    this.logs.push(message);
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
logger.add(testTransport);

function clearTestLogs() {
  testTransport.clearLogs();
}

function getTestLogs() {
  return testTransport.readLogs();
}

/**
 * Helper function to wait for logs to be written asynchronously.
 * This ensures that all logs have been processed before assertions are made.
 */
function waitForLogs(timeout = 100): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, timeout);
  });
}

Deno.test({
  name: "Logger functionality",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    /**
     * Test the setupLogging function
     * This test verifies that the logger can be set up with different log levels
     * and that it produces output for each level.
     */
    await t.step("setupLogging function", () => {
      const levels: LevelName[] = ["error", "warn", "info", "debug"];
      levels.forEach((level) => {
        setupLogging(level);
        logger.log(level, "Test message");
        const logs = getTestLogs();
        assert(logs.length > 0, `Should log a message for ${level} level`);
      });
    });

    /**
     * Test the parseStack function
     * This test ensures that the parseStack function correctly extracts
     * the relevant information from different types of stack traces.
     */
    await t.step("parseStack function", () => {
      const testCases = [
        {
          name: "regular invocation",
          input: `Error
      at Object.get (file:///bids-validator/src/utils/logger.ts:39:19)
      at file:///bids-validator/src/schema/context.ts:170:16
      at async BIDSContext.loadColumns (file:///bids-validator/src/schema/context.ts:163:20)`,
          expected: "file:///bids-validator/src/schema/context.ts:170:16",
        },
        {
          name: "catch invocation",
          input: `Error
      at Object.get (file:///bids-validator/bids-validator/src/utils/logger.ts:31:19)
      at loadHeader (file:///bids-validator/bids-validator/src/files/nifti.ts:18:12)
      at async BIDSContext.loadNiftiHeader (file:///bids-validator/bids-validator/src/schema/context.ts:155:27)`,
          expected:
            "loadHeader (file:///bids-validator/bids-validator/src/files/nifti.ts:18:12)",
        },
        {
          name: "empty stack",
          input: "",
          expected: "",
        },
      ];

      testCases.forEach(({ name, input, expected }) => {
        assertEquals(
          parseStack(input),
          expected,
          `parseStack should handle ${name} correctly`,
        );
      });
    });

    /**
     * Test logger proxy and log methods
     * This test verifies that all log levels (error, warn, info, debug)
     * produce output and contain the expected message.
     */
    await t.step("logger proxy and log methods", async () => {
      const levels = ["error", "warn", "info", "debug"];
      const logMethods = [error, warn, info, debug];

      for (let i = 0; i < levels.length; i++) {
        clearTestLogs();
        logMethods[i]("Test message");
        await waitForLogs();
        const logs = getTestLogs();
        assert(logs.length > 0, `${levels[i]} log should produce output`);
        assert(
          logs.some((log) => log.includes("Test message")),
          `${levels[i]} log should contain the test message`,
        );
      }
    });

    /**
     * Test LogLevels enum
     * This test ensures that the LogLevels enum contains the expected values.
     */
    await t.step("LogLevels enum", () => {
      assertEquals(
        LogLevels.ERROR,
        "error",
        'LogLevels.ERROR should be "error"',
      );
      assertEquals(LogLevels.WARN, "warn", 'LogLevels.WARN should be "warn"');
      assertEquals(LogLevels.INFO, "info", 'LogLevels.INFO should be "info"');
      assertEquals(
        LogLevels.DEBUG,
        "debug",
        'LogLevels.DEBUG should be "debug"',
      );
    });

    /**
     * Test logger.debug with stack trace
     * This test verifies that the debug log method produces output
     * and includes the expected debug message.
     */
    await t.step("logger.debug with stack trace", async () => {
      clearTestLogs();
      debug("Debug message");
      await waitForLogs();
      const logs = getTestLogs();
      assert(logs.length > 0, "Debug log should produce output");
      assert(
        logs.some((log) => log.includes("Debug message")),
        "Debug message should be logged",
      );
    });
  },
});

/**
 * Cleanup test
 * This test ensures that the custom transport can be removed from the logger.
 * It's important to clean up after tests to avoid affecting other parts of the application.
 */
Deno.test({
  name: "Cleanup",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () => {
    logger.remove(testTransport);
  },
});
