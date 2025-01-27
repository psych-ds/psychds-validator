/**
 * @fileoverview Provides CSV parsing functionality with robust error handling.
 * Handles parsing CSV content across different platforms, validates structure,
 * and checks for common issues like row_id uniqueness and header consistency.
 */

import { ColumnsMap } from "../types/columns.ts";
import { isBrowser } from "../utils/platform.ts";

/**
 * Normalizes line endings across different platforms
 * Converts both CRLF and CR to LF
 *
 * @param str - String to normalize
 * @returns String with normalized line endings
 */
const normalizeEOL = (str: string): string =>
  str.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

/**
 * Represents an issue found during CSV parsing
 */
export interface csvIssue {
  /** Type of issue encountered */
  issue: string;
  /** Detailed message about the issue, null for standard issues */
  message: string | null;
}

/**
 * Parses CSV content and validates its structure
 *
 * Performs several validations:
 * 1. Checks for presence of headers
 * 2. Validates consistent column counts across rows
 * 3. Verifies row_id uniqueness if present
 *
 * Uses different parsing strategies for browser and Node.js environments.
 * Handles empty lines and inconsistent column counts gracefully.
 *
 * @param contents - CSV content as string
 * @returns Object containing:
 *          - columns: Map of column names to their values
 *          - issues: Array of parsing/validation issues
 */
export async function parseCSV(contents: string) {
  // Initialize result structures
  const columns = new ColumnsMap();
  const issues: csvIssue[] = [];
  const normalizedStr = normalizeEOL(contents);

  try {
    // Dynamically import appropriate parser based on environment
    const parse = isBrowser
      ? (await import("npm:csv-parse/browser/esm/sync")).parse
      : (await import("npm:csv-parse/sync")).parse;

    // Parse CSV with flexible options for error handling
    const rows: string[][] = parse(normalizedStr, {
      skip_empty_lines: false,
      relax_column_count: true, // Allow inconsistent columns for better error handling
    });

    const headers = rows.length ? rows[0] : [];

    // Check for duplicate headers
    if (new Set(headers).size !== headers.length) {
      issues.push({ "issue": "CSVHeaderRepeated", "message": null });
    }

    // Check for missing headers
    if (headers.length === 0) {
      issues.push({ "issue": "CSVHeaderMissing", "message": null });
    } else {
      // Initialize column arrays based on headers
      headers.forEach((x) => {
        columns[x] = [];
      });

      // Process and validate each data row
      for (let i = 1; i < rows.length; i++) {
        if (rows[i].length !== headers.length) {
          // Report column count mismatches with specific details
          issues.push({
            "issue": "CSVHeaderLengthMismatch",
            "message": `Row ${i + 1} has ${
              rows[i].length
            } columns, expected ${headers.length}`,
          });
        } else {
          // Populate column arrays with row values
          for (let j = 0; j < headers.length; j++) {
            const col = columns[headers[j]] as string[];
            col.push(rows[i][j]);
          }
        }
      }

      // Validate row_id uniqueness if present
      if (columns["row_id"] && Array.isArray(columns["row_id"])) {
        const rowIdSet = new Set(columns["row_id"]);
        if (rowIdSet.size !== columns["row_id"].length) {
          issues.push({ "issue": "RowidValuesNotUnique", "message": null });
        }
      }
    }
  } catch (error) {
    // Handle parsing errors with detailed messages
    issues.push({
      "issue": "CSVFormattingError",
      // deno-lint-ignore no-explicit-any
      "message": (error as unknown as any).message,
    });
  }

  return {
    "columns": columns as ColumnsMap,
    "issues": issues as csvIssue[],
  };
}
