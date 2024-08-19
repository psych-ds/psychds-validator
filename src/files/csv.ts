/*
 * CSV
 * Module for parsing CSV
 */

import { ColumnsMap } from "../types/columns.ts";
// Changed from Deno std library to npm package for better cross-platform compatibility
import { parse } from "npm:csv-parse/sync";

// Helper function to normalize line endings
const normalizeEOL = (str: string): string =>
  str.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

export interface csvIssue {
  issue: string;
  message: string | null;
}

// Function to parse CSV contents
export function parseCSV(contents: string) {
  const columns = new ColumnsMap();
  const issues: csvIssue[] = [];
  const normalizedStr = normalizeEOL(contents);

  try {
    // Use the new csv-parse library with more flexible options
    const rows: string[][] = parse(normalizedStr, {
      skip_empty_lines: false,
      relax_column_count: true, // Allow rows with inconsistent column counts for better error handling
    });

    const headers = rows.length ? rows[0] : [];

    if (headers.length === 0) {
      issues.push({ "issue": "NoHeader", "message": null });
    } else {
      // Initialize columns based on headers
      headers.forEach((x) => {
        columns[x] = [];
      });

      // Process each row, checking for mismatches and populating columns
      for (let i = 1; i < rows.length; i++) {
        if (rows[i].length !== headers.length) {
          // Improved error reporting: specify which row has a mismatch and how many columns it has
          issues.push({
            "issue": "HeaderRowMismatch",
            "message": `Row ${i + 1} has ${
              rows[i].length
            } columns, expected ${headers.length}`,
          });
        } else {
          for (let j = 0; j < headers.length; j++) {
            const col = columns[headers[j]] as string[];
            col.push(rows[i][j]);
          }
        }
      }

      // Check for row_id uniqueness
      if (columns["row_id"] && Array.isArray(columns["row_id"])) {
        const rowIdSet = new Set(columns["row_id"]);
        if (rowIdSet.size !== columns["row_id"].length) {
          issues.push({ "issue": "RowidValuesNotUnique", "message": null });
        }
      }
    }
  } catch (error) {
    issues.push({ "issue": "CSVFormattingError", "message": error.message });
  }

  // Return both columns and issues
  return {
    "columns": columns as ColumnsMap,
    "issues": issues as csvIssue[],
  };
}
