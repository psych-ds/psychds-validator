/**
 * @fileoverview Main validation module for Psych-DS  validation.
 * Provides core functionality for validating dataset structures against defined schemas.
 */

import { emptyFile } from "./internal/emptyFile.ts";
import {
  checkDirRules,
  filenameIdentify,
  findFileRules,
} from "./filenameIdentify.ts";
import { checkMissingRules, filenameValidate } from "./filenameValidate.ts";
import { applyRules } from "../schema/applyRules.ts";
import { CheckFunction } from "../types/check.ts";
import { FileTree } from "../types/filetree.ts";
import { ValidatorOptions } from "../setup/options.ts";
import { ValidationResult } from "../types/validation-result.ts";
import { DatasetIssues } from "../issues/datasetIssues.ts";
import { IssueFile } from "../types/issues.ts";
import { Summary } from "../summary/summary.ts";
import { loadSchema } from "../setup/loadSchema.ts";
import { psychDSFile } from "../types/file.ts";
import { psychDSContextDataset } from "../schema/context.ts";
import { walkFileTree } from "../schema/walk.ts";
import { GenericSchema } from "../types/schema.ts";
import { EventEmitter } from "../utils/platform.ts";

/** Array of validation check functions to be applied to each file */
const CHECKS: CheckFunction[] = [
  emptyFile,
  filenameIdentify,
  filenameValidate,
  applyRules,
];

/**
 * Validates a file tree against the Psych-DS schema
 * @param fileTree - The hierarchical structure of files to validate
 * @param options - Validation options and optional event emitter
 * @returns Promise resolving to validation results including issues and summary
 */
export async function validate(
  fileTree: FileTree,
  options: ValidatorOptions & { emitter?: typeof EventEmitter },
): Promise<ValidationResult> {
  // Signal start of validation process
  options.emitter?.emit("start", { success: true });

  const summary = new Summary();
  const schema = await loadSchema(options.schema);
  const issues = new DatasetIssues(schema as unknown as GenericSchema);

  let totalCsvFiles = 0;
  let processedCsvFiles = 0;

  // Signal successful file tree construction
  options.emitter?.emit("build-tree", { success: true });

  summary.schemaVersion = schema.schema_version;

  // Look for dataset_description.json in root to determine if dealing with derivative dataset
  const ddFile = fileTree.files.find(
    (file: psychDSFile) => file.path === "/dataset_description.json",
  );

  let dsContext;
  if (ddFile) {
    options.emitter?.emit("find-metadata", { success: true });
    try {
      const description = await ddFile.text()
        .then(JSON.parse);

      dsContext = new psychDSContextDataset(options, ddFile, description);
    } catch (_error) {
      // Handle invalid JSON formatting in metadata
      dsContext = new psychDSContextDataset(options, ddFile);
      issues.addSchemaIssue(
        "InvalidJsonFormatting",
        [{
          ...ddFile,
          evidence: (_error as unknown as any).message,
        } as IssueFile],
      );
      options.emitter?.emit("metadata-json", {
        success: false,
        issue: issues.get("INVALID_JSON_FORMATTING"),
      });
    }
  } else {
    dsContext = new psychDSContextDataset(options);
  }

  // Track which schema rules are satisfied by files in the dataset
  const rulesRecord: Record<string, boolean> = {};
  findFileRules(schema, rulesRecord);

  /**
   * Helper to emit check events based on presence of specific issues
   * @param event_name - Name of event to emit
   * @param issue_keys - Array of issue keys to check for
   */
  const emitCheck = (
    event_name: string, 
    issue_keys: string[], 
    progress?: { current: number; total: number }
  ) => {
    const fails = issue_keys.filter((issue) => issues.hasIssue({ key: issue }));
  
    const eventData = fails.length > 0
      ? { success: false, issue: issues.get(fails[0]), progress }
      : { success: true, progress };
  
    options.emitter?.emit(event_name, eventData);
  };

  let validColumns: Record<string, boolean> = {}

  for await (const context of walkFileTree(fileTree, issues, dsContext)) {
    if (context.extension === ".csv" && context.suffix === "data") {
      totalCsvFiles++;
    }
  }

  if (totalCsvFiles > 0) {
    options.emitter?.emit("csv-count-total", { total: totalCsvFiles });
  }

  // Process each file in the tree
  for await (const context of walkFileTree(fileTree, issues, dsContext)) {
    if (dsContext.baseDirs.includes("/data")) {
      options.emitter?.emit("find-data-dir", { success: true });
    }
    // Handle any issues found during file tree reading
    if (context.file.issueInfo.length > 0) {
      context.file.issueInfo.forEach((iss) => {
        issues.addSchemaIssue(
          iss.key,
          [{
            ...context.file,
            evidence: iss.evidence ? iss.evidence : "",
          } as IssueFile],
        );
      });
    }

    if (context.file.ignored) continue;

    await context.asyncLoads();

    // Track CSV columns for summary
    if (context.extension === ".csv") {
      summary.suggestedColumns = [
        ...new Set([
          ...summary.suggestedColumns,
          ...Object.keys(context.columns),
        ]),
      ];
    }

    // Run validation checks
    for (const check of CHECKS) {
      await check(schema as unknown as GenericSchema, context);
    }

    // Update rules record and summary
    for (const rule of context.filenameRules) {
      rulesRecord[rule] = true;
    }

    await summary.update(context);

    // Emit events for metadata and CSV validation
    if (context.extension === ".csv" && context.suffix === "data") {
      options.emitter?.emit("check-for-csv", { success: true });
      options.emitter?.emit("metadata-utf8", { success: true });
      emitCheck("metadata-json", ["INVALID_JSON_FORMATTING"]);
      emitCheck("metadata-fields", ["JSON_KEY_REQUIRED"]);
      emitCheck("metadata-jsonld", ["INVALID_JSONLD_FORMATTING"]);
      emitCheck("metadata-type", [
        "INCORRECT_DATASET_TYPE",
        "MISSING_DATASET_TYPE",
      ]);
      emitCheck("metadata-schemaorg", [
        "INVALID_SCHEMAORG_PROPERTY",
        "INVALID_OBJECT_TYPE",
        "OBJECT_TYPE_MISSING",
      ]);
      processedCsvFiles++;

      options.emitter?.emit("csv-progress", { 
        current: processedCsvFiles, 
        total: totalCsvFiles 
      });
      
      // Emit progress for each CSV validation step with counter
      const csvProgress = { current: processedCsvFiles, total: totalCsvFiles };
      
      emitCheck("csv-keywords", ["FILENAME_KEYWORD_FORMATTING_ERROR", "FILENAME_UNOFFICIAL_KEYWORD_ERROR"], csvProgress);
      emitCheck("csv-parse", ["CSV_FORMATTING_ERROR"], csvProgress);
      emitCheck("csv-header", ["CSV_HEADER_MISSING"], csvProgress);
      emitCheck("csv-header-repeat", ["CSV_HEADER_REPEATED"], csvProgress);
      emitCheck("csv-nomismatch", ["CSV_HEADER_LENGTH_MISMATCH"], csvProgress);
      emitCheck("csv-rowid", ["ROWID_VALUES_NOT_UNIQUE"], csvProgress);
    
    }

    if(context.validColumns.length != 0){
      context.validColumns.forEach((col) => {
        if(!(col in validColumns))
          validColumns[col] = false
        if(col in context.columns)
          validColumns[col] = true
      })
    }
  }

  const extraVars = Object.entries(validColumns)
  .filter(([key, value]) => !value)
  .map(([key]) => key);

  if (extraVars.length != 0){
    issues.addSchemaIssue("VariableMissingFromCsvColumns", [
      {
        ...dsContext.metadataFile,
        evidence:
          `One of the metadata files in your dataset (either dataset_description.json or a sidecar file) 
          contains a variable in variableMeasured that does not appear in any CSV column headers. Here are the variables in question: [${extraVars}]`,
      },
    ]);
  }

  // Final metadata validation events
  options.emitter?.emit("metadata-utf8", { success: true });
  emitCheck("metadata-json", ["INVALID_JSON_FORMATTING"]);
  emitCheck("metadata-fields", ["JSON_KEY_REQUIRED"]);
  emitCheck("metadata-jsonld", ["INVALID_JSONLD_FORMATTING"]);
  emitCheck("metadata-type", [
    "INCORRECT_DATASET_TYPE",
    "MISSING_DATASET_TYPE",
  ]);
  emitCheck("metadata-schemaorg", [
    "INVALID_SCHEMAORG_PROPERTY",
    "INVALID_OBJECT_TYPE",
    "OBJECT_TYPE_MISSING",
  ]);

  // CSV validation events
  emitCheck("csv-keywords", [
    "FILENAME_KEYWORD_FORMATTING_ERROR",
    "FILENAME_UNOFFICIAL_KEYWORD_ERROR",
  ]);
  emitCheck("csv-parse", ["CSV_FORMATTING_ERROR"]);
  emitCheck("csv-header", ["CSV_HEADER_MISSING"]);
  emitCheck("csv-header-repeat",["CSV_HEADER_REPEATED"])
  emitCheck("csv-nomismatch", ["CSV_HEADER_LENGTH_MISMATCH"]);
  emitCheck("csv-rowid", ["ROWID_VALUES_NOT_UNIQUE"]);
  emitCheck("check-variableMeasured", ["CSV_COLUMN_MISSING_FROM_METADATA","VARIABLE_MISSING_FROM_CSV_COLUMNS"]);

  // Check directory rules and missing rules
  checkDirRules(schema, rulesRecord, dsContext.baseDirs);
  checkMissingRules(schema as unknown as GenericSchema, rulesRecord, issues);

  // Final validation checks
  emitCheck("find-metadata", ["MISSING_DATASET_DESCRIPTION"]);
  emitCheck("find-data-dir", ["MISSING_DATA_DIRECTORY"]);
  emitCheck("check-for-csv", ["MISSING_DATAFILE"]);

  // Filter issues for unfound objects
  issues.filterIssues(rulesRecord);

  return {
    valid: [...issues.values()].filter((issue) => issue.severity === "error")
      .length === 0,
    issues,
    summary: summary.formatOutput(),
  };
}
