/**
 * Utilities for formatting human readable output (CLI or other UIs)
 */
import chalk from "npm:chalk";
import Table from "npm:cli-table3";
import { SummaryOutput, ValidationResult } from "../types/validation-result.ts";
import { Issue } from "../types/issues.ts";

interface LoggingOptions {
  verbose: boolean;
  showWarnings: boolean;
}

// Simple prettyBytes function to replace prettyBytes dependency
function prettyBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  if (bytes === 0) return "0 B";
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + " " + units[i];
}

/**
 * Format for Unix consoles
 *
 * Returns the full output string with newlines
 */
export function consoleFormat(
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
      issue.key === "CSV_COLUMN_MISSING"
    ).length === 1;
  if (errors.length === 0) {
    output.push(chalk.green(`
        **********************************************
        This dataset appears to be psych-DS compatible
        **********************************************\n`));
    if (options?.showWarnings) {
      warnings.forEach((issue) => output.push(formatIssue(issue, options)));
    }
  } else {
    output.push(chalk.red(`
        ******************************************************
        This dataset does not appear to be psych-DS compatible
        ******************************************************\n`));
    errors.forEach((issue) => output.push(formatIssue(issue, options)));
    if (options?.showWarnings) {
      warnings.forEach((issue) => output.push(formatIssue(issue, options)));
    }
  }
  if (csv_issue) {
    output.push("");
    output.push(
      `There was an issue with your variableMeasured value. Here is a suggested value:`,
    );
    output.push("");
    output.push(JSON.stringify(result.summary.suggestedColumns));
  }
  output.push("");
  output.push(formatSummary(result.summary));
  output.push("");
  return output.join("\n");
}

/**
 * Format one issue as text with colors
 */
function formatIssue(issue: Issue, options?: LoggingOptions): string {
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
 * Format for the summary
 */
function formatSummary(summary: SummaryOutput): string {
  const output = [];

  const table = new Table({
    chars: {
      "top": "",
      "top-mid": "",
      "top-left": "",
      "top-right": "",
      "bottom": "",
      "bottom-mid": "",
      "bottom-left": "",
      "bottom-right": "",
      "left": "",
      "left-mid": "",
      "mid": "",
      "mid-mid": "",
      "right": "",
      "right-mid": "",
      "middle": " ",
    },
    style: { "padding-left": 2, "padding-right": 2 },
  });

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
