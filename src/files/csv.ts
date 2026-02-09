import { ColumnsMap } from "../types/columns.ts";
import { isBrowser } from "../utils/platform.ts";

const normalizeEOL = (str: string): string =>
  str.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

export interface csvIssue {
  issue: string;
  message: string | null;
}

// Cache the parser at module level - import once, use many times
let cachedParse: ((input: string, options?: object) => string[][]) | null = null;

async function getParser() {
  if (!cachedParse) {
    cachedParse = isBrowser
      ? (await import("npm:csv-parse/browser/esm/sync")).parse
      : (await import("npm:csv-parse/sync")).parse;
  }
  return cachedParse;
}

/**
 * Parse CSV or TSV file contents
 * @param contents - The file contents as a string
 * @param extension - The file extension (e.g., ".csv" or ".tsv"). Defaults to ".csv"
 * @returns Object containing columns map and any parsing issues
 */
export async function parseCSV(contents: string, extension: string = ".csv") {
  const columns = new ColumnsMap();
  const issues: csvIssue[] = [];
  const normalizedStr = normalizeEOL(contents);
  const delimiter = extension === ".tsv" ? '\t' : ',';
  const formatName = extension === ".tsv" ? 'TSV' : 'CSV';

  try {
    const parse = await getParser();

    const rows: string[][] = parse(normalizedStr, {
      skip_empty_lines: false,
      relax_column_count: true,
      delimiter: delimiter,
    });

    const headers = rows.length ? rows[0] : [];

    if (new Set(headers).size !== headers.length) {
      const seen = new Set<string>();
      const duplicates = new Set<string>();
      for (const h of headers) {
        if (seen.has(h)) duplicates.add(h);
        seen.add(h);
      }
      issues.push({
        issue: "CSVHeaderRepeated",
        message: `Duplicate column headers found: [${[...duplicates].join(", ")}]`,
      });
    }

    if (headers.length === 0) {
      issues.push({ issue: "CSVHeaderMissing", message: `${formatName} file contains no headers` });
    } else {
      const numDataRows = rows.length - 1;
      
      // Pre-allocate arrays with known size
      headers.forEach((header) => {
        columns[header] = new Array(numDataRows);
      });

      let validRowIndex = 0;
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length !== headers.length) {
          issues.push({
            issue: "CSVHeaderLengthMismatch",
            message: `Row ${i + 1} has ${row.length} columns, expected ${headers.length}`,
          });
        } else {
          // Direct index assignment instead of push
          for (let j = 0; j < headers.length; j++) {
            (columns[headers[j]] as string[])[validRowIndex] = row[j];
          }
          validRowIndex++;
        }
      }

      // Trim arrays if some rows were invalid
      if (validRowIndex < numDataRows) {
        headers.forEach((header) => {
          (columns[header] as string[]).length = validRowIndex;
        });
      }

      if (columns["row_id"] && Array.isArray(columns["row_id"])) {
        const rowIds = columns["row_id"];
        const rowIdSet = new Set(rowIds);
        if (rowIdSet.size !== rowIds.length) {
          const seen = new Set<string>();
          const duplicates = new Set<string>();
          for (const id of rowIds) {
            if (seen.has(id)) duplicates.add(id);
            seen.add(id);
          }
          issues.push({
            issue: "RowidValuesNotUnique",
            message: `Duplicate row_id values found: [${[...duplicates].join(", ")}]`,
          });
        }
      }
    }
  } catch (error) {
    issues.push({
      issue: "CSVFormattingError",
      message: `${formatName} parsing error: ${(error as Error).message}`,
    });
  }

  return { columns: columns as ColumnsMap, issues: issues as csvIssue[] };
}