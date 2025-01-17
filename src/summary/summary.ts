/**
 * @fileoverview Handles collection and formatting of validation summary data.
 * Tracks file counts, sizes, data types, and other metadata during validation.
 */

import { SummaryOutput } from "../types/validation-result.ts";
import { psychDSContext } from "../schema/context.ts";

/**
 * Collects and manages summary information during validation process.
 * Tracks metrics like total files, sizes, and data types encountered.
 */
export class Summary {
  /** Total number of files processed during validation */
  totalFiles: number;

  /** Total size of all processed files in bytes */
  size: number;

  /** Flag indicating if derivative data has been processed */
  dataProcessed: boolean;

  /** Set of unique data types encountered during validation */
  dataTypes: Set<string>;

  /** Version of the schema used for validation */
  schemaVersion: string;

  /** Array of column names suggested for CSV files */
  suggestedColumns: string[];

  /**
   * Initializes a new Summary instance with default values
   */
  constructor() {
    this.dataProcessed = false;
    this.totalFiles = -1;
    this.size = 0;
    this.dataTypes = new Set();
    this.schemaVersion = "";
    this.suggestedColumns = [];
  }

  /**
   * Updates summary information with data from a new context
   * Tracks file counts, sizes, and data types
   *
   * @param context - Current validation context to process
   * @returns Promise that resolves when update is complete
   */
  async update(context: psychDSContext): Promise<void> {
    // Skip derivative files if not yet processed
    if (context.file.path.startsWith("/derivatives") && !this.dataProcessed) {
      return;
    }

    this.totalFiles++;
    this.size += await context.file.size;

    if (context.datatype.length) {
      this.dataTypes.add(context.datatype);
    }
  }

  /**
   * Formats the summary data for output
   * Converts internal state to a standardized output format
   *
   * @returns Formatted summary data object
   */
  formatOutput(): SummaryOutput {
    return {
      totalFiles: this.totalFiles,
      size: this.size,
      dataProcessed: this.dataProcessed,
      dataTypes: Array.from(this.dataTypes),
      schemaVersion: this.schemaVersion,
      suggestedColumns: this.suggestedColumns,
    };
  }
}
