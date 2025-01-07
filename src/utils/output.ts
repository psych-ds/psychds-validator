/**
 * @fileoverview Handles formatting and display of validation results across different platforms.
 * Provides consistent output formatting for both browser and Node.js environments,
 * with special handling for colored output and table formatting in Node.js.
 */

import { SummaryOutput, ValidationResult } from "../types/validation-result.ts";
import { Issue } from "../types/issues.ts";
import { isBrowser } from "./platform.ts";

/** Configuration options for output formatting */
interface LoggingOptions {
  verbose: boolean;
  showWarnings: boolean;
}

/**
 * Converts bytes to human-readable format
 * @param bytes - Number of bytes to format
 * @returns Formatted string with appropriate unit (B, KB, MB, etc.)
 */
function prettyBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  if (bytes === 0) return "0 B";
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + " " + units[i];
}

/** Interface for text coloring functionality */
interface Chalk {
  green: (text: string) => string;
  red: (text: string) => string;
  yellow: (text: string) => string;
  magenta: (text: string) => string;
}

/** Interface for table formatting functionality */
interface Table {
  push: (row: string[]) => void;
  toString: () => string;
}

// Module-level instances for chalk and table functionality
let chalkInstance: Chalk | null = null;
// deno-lint-ignore no-unused-vars
let tableClass: (new () => Table) | null = null;

/**
 * Dynamically imports chalk library for terminal coloring
 * @returns Promise resolving to Chalk instance or null in browser
 */
async function importChalk(): Promise<Chalk | null> {
  if (isBrowser) return null;
  const chalk = await import("npm:chalk");
  return chalk.default;
}

/**
 * Dynamically imports cli-table3 for terminal table formatting
 * @returns Promise resolving to Table constructor or null in browser
 */
async function importTable(): Promise<(new () => Table) | null> {
  if (isBrowser) return null;
  const cliTable = await import("npm:cli-table3");
  return cliTable.default;
}

// Cached promises for dynamic imports
let chalkPromise: Promise<Chalk | null> | null = null;
let tablePromise: Promise<(new () => Table) | null> | null = null;

/**
 * Gets appropriate Chalk instance for current environment
 * Returns proxy object for browser that mimics Chalk interface
 */
function getChalk(): Chalk {
  if (isBrowser) {
    return {
      green: (text) => text,
      red: (text) => text,
      yellow: (text) => text,
      magenta: (text) => text,
    };
  }
  if (!chalkPromise) {
    chalkPromise = importChalk();
  }
  return new Proxy({} as Chalk, {
    get: (_target, prop) => {
      return (text: string) => {
        if (chalkInstance) {
          // deno-lint-ignore no-explicit-any
          return (chalkInstance as any)[prop](text);
        }
        return `[CHALK ${prop.toString().toUpperCase()}]${text}[/CHALK]`;
      };
    },
  });
}

/**
 * Gets appropriate Table constructor for current environment
 * Returns simple table implementation for browser
 */
function getTable(): new () => Table {
  if (isBrowser) {
    return class BrowserTable {
      rows: string[][] = [];
      push(row: string[]) {
        this.rows.push(row);
      }
      toString() {
        return this.rows.map((row) => row.join(" ")).join("\n");
      }
    } as unknown as new () => Table;
  }
  if (!tablePromise) {
    tablePromise = importTable();
  }
  return class ProxyTable {
    private table: Table | null = null;
    async init() {
      const TableClass = await tablePromise;
      this.table = TableClass ? new TableClass() : null;
    }
    push(row: string[]) {
      if (this.table) {
        this.table.push(row);
      }
    }
    toString() {
      return this.table ? this.table.toString() : "";
    }
  } as unknown as new () => Table;
}

/**
 * Main entry point for formatting validation results
 * @param result - Validation results to format
 * @param options - Formatting options
 * @returns Formatted string representation of results
 */
export function consoleFormat(
  result: ValidationResult,
  options?: LoggingOptions,
): string {
  return isBrowser
    ? browserConsoleFormat(result, options)
    : nodeConsoleFormat(result, options, getChalk(), getTable());
}

/**
 * Formats validation results for browser environment
 * @param result - Validation results to format
 * @param options - Formatting options
 * @returns Browser-friendly formatted string
 */
function browserConsoleFormat(
  result: ValidationResult,
  options?: LoggingOptions,
): string {
  const output = [];
  const errors = [...result.issues.values()].filter((issue) =>
    issue.severity === "error"
  );
  const warnings = [...result.issues.values()].filter((issue) =>
    issue.severity === "warning"
  );
  const csv_issue =
    [...result.issues.values()].filter((issue) =>
      issue.key === "CSV_COLUMN_MISSING_FROM_METADATA"
    ).length === 1;

  if (errors.length === 0) {
    output.push("This dataset appears to be psych-DS compatible");
    if (options?.showWarnings) {
      warnings.forEach((issue) =>
        output.push(browserFormatIssue(issue, options))
      );
    }
  } else {
    output.push("This dataset does not appear to be psych-DS compatible");
    errors.forEach((issue) => output.push(browserFormatIssue(issue, options)));
    if (options?.showWarnings) {
      warnings.forEach((issue) =>
        output.push(browserFormatIssue(issue, options))
      );
    }
  }

  // Handle CSV-specific issues
  if (csv_issue) {
    output.push("");
    output.push(
      `There was an issue with your variableMeasured value. Here is a suggested value:`,
    );
    output.push("");
    output.push(JSON.stringify(result.summary.suggestedColumns));
  }

  output.push("");
  output.push(browserFormatSummary(result.summary));
  output.push("");

  return output.join("\n");
}

/**
 * Formats a single issue for browser display
 * @param issue - Issue to format
 * @param options - Formatting options
 * @returns Formatted issue string
 */
function browserFormatIssue(issue: Issue, options?: LoggingOptions): string {
  const output = [];
  output.push(
    `[${issue.severity.toUpperCase()}] ${issue.reason} (${issue.key})`,
  );
  output.push("");

  let fileOutCount = 0;
  issue.files.forEach((file) => {
    if (!options?.verbose && fileOutCount > 2) {
      return;
    }
    output.push(`  .${file.path}`);
    if (file.line) {
      let msg = `    @ line: ${file.line}`;
      if (file.character) {
        msg += ` character: ${file.character}`;
      }
      output.push(msg);
    }
    if (file.evidence) {
      output.push(`    Evidence: ${file.evidence}`);
    }
    fileOutCount++;
  });

  if (!options?.verbose) {
    output.push("");
    output.push(`  ${issue.files.size} more files with the same issue`);
  }
  output.push("");

  return output.join("\n");
}

/**
 * Formats validation summary for browser display
 * @param summary - Summary to format
 * @returns Formatted summary string
 */
function browserFormatSummary(summary: SummaryOutput): string {
  return `Summary: ${summary.totalFiles} Files, ${prettyBytes(summary.size)}`;
}

/**
 * Formats validation results for Node.js environment
 * Includes colored output and formatted tables
 */
function nodeConsoleFormat(
  result: ValidationResult,
  options: LoggingOptions | undefined,
  chalk: Chalk,
  Table: new () => Table,
): string {
  const output = [];
  const errors = [...result.issues.values()].filter((issue) =>
    issue.severity === "error"
  );
  const warnings = [...result.issues.values()].filter((issue) =>
    issue.severity === "warning"
  );
  const csv_issue =
    [...result.issues.values()].filter((issue) =>
      issue.key === "CSV_COLUMN_MISSING_FROM_METADATA"
    ).length === 1;

  // Format validation status with appropriate coloring
  if (errors.length === 0) {
    output.push(chalk.green(`
        **********************************************
        This dataset appears to be psych-DS compatible
        **********************************************\n`));
    if (options?.showWarnings) {
      warnings.forEach((issue) =>
        output.push(nodeFormatIssue(issue, options, chalk))
      );
    }
  } else {
    output.push(chalk.red(`
        ******************************************************
        This dataset does not appear to be psych-DS compatible
        ******************************************************\n`));
    errors.forEach((issue) =>
      output.push(nodeFormatIssue(issue, options, chalk))
    );
    if (options?.showWarnings) {
      warnings.forEach((issue) =>
        output.push(nodeFormatIssue(issue, options, chalk))
      );
    }
  }

  // Handle CSV-specific issues
  if (csv_issue) {
    output.push("");
    output.push(
      `There was an issue with your variableMeasured value. Here is a suggested value:`,
    );
    output.push("");
    output.push(JSON.stringify(result.summary.suggestedColumns));
  }

  output.push("");
  output.push(nodeFormatSummary(result.summary, chalk, Table));
  output.push("");

  return output.join("\n");
}

/**
 * Platform-agnostic issue formatting function
 * @returns Appropriately formatted issue string for current platform
 */
export function formatIssue(issue: Issue, options?: LoggingOptions): string {
  return isBrowser
    ? browserFormatIssue(issue, options)
    : nodeFormatIssue(issue, options, getChalk());
}

/**
 * Formats a single issue for Node.js display with colors
 */
function nodeFormatIssue(
  issue: Issue,
  options: LoggingOptions | undefined,
  chalk: Chalk,
): string {
  const severity = issue.severity;
  const color = severity === "error" ? chalk.red : chalk.yellow;
  const output = [];
  output.push(
    "\t" +
      color(
        `[${severity.toUpperCase()}] ${issue.reason} (${issue.key})`,
      ),
  );
  output.push("");

  let fileOutCount = 0;
  issue.files.forEach((file) => {
    if (!options?.verbose && fileOutCount > 2) {
      return;
    }
    output.push("\t\t." + file.path);
    if (file.line) {
      let msg = "\t\t\t@ line: " + file.line;
      if (file.character) {
        msg += " character: " + file.character;
      }
      output.push(msg);
    }
    if (file.evidence) {
      output.push("\t\t\tEvidence: " + file.evidence);
    }
    fileOutCount++;
  });

  if (!options?.verbose) {
    output.push("");
    output.push("\t\t" + issue.files.size + " more files with the same issue");
  }
  output.push("");

  return output.join("\n");
}

/**
 * Platform-agnostic summary formatting function
 */
export function formatSummary(summary: SummaryOutput): string {
  return isBrowser
    ? browserFormatSummary(summary)
    : nodeFormatSummary(summary, getChalk(), getTable());
}

/**
 * Formats summary for Node.js display with colors and tables
 */
function nodeFormatSummary(
  summary: SummaryOutput,
  chalk: Chalk,
  Table: new () => Table,
): string {
  const output = [];
  const table = new Table();

  table.push(
    [
      chalk.magenta("Summary:"),
      `${summary.totalFiles} Files, ${prettyBytes(summary.size)}`,
    ],
  );

  output.push(table.toString());
  output.push("");

  return output.join("\n");
}

// Initialize chalk and table asynchronously for Node.js environment
(async () => {
  if (!isBrowser) {
    chalkInstance = await importChalk();
    tableClass = await importTable();
  }
})();
