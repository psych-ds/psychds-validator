/**
 * @fileoverview Manages validation issues for Psych-DS datasets.
 * Provides functionality for collecting, tracking, and formatting validation
 * issues found during dataset validation. Supports both error and warning
 * severity levels with file-specific context tracking.
 */

import {
  FullTestIssuesReturn,
  Issue,
  IssueFile,
  IssueFileOutput,
  IssueOutput,
  Severity,
} from "../types/issues.ts";
import { GenericSchema } from "../types/schema.ts";

/** Special code to indicate deprecated status in issue output */
const CODE_DEPRECATED = Number.MIN_SAFE_INTEGER;

/**
 * Formats a file reference with issue context for output
 * Creates standardized output format for file-specific issues
 * 
 * @param issue - Issue associated with the file
 * @param f - File information to format
 * @returns Formatted issue output for the file
 */
const issueFile = (issue: Issue, f: IssueFile): IssueFileOutput => {
  const evidence = f.evidence || "";
  const reason = issue.reason || "";
  const line = f.line || 0;
  const character = f.character || 0;
  return {
    key: issue.key,
    code: CODE_DEPRECATED,
    file: { path: f.path, name: f.name, relativePath: f.path },
    evidence,
    line,
    character,
    severity: issue.severity,
    reason,
    helpUrl: issue.helpUrl,
  };
};

/** Parameters for adding a new issue to the collection */
interface DatasetIssuesAddParams {
  /** Unique identifier for the issue type */
  key: string;
  /** Human-readable description of the issue */
  reason: string;
  /** Issue severity level (defaults to error) */
  severity?: Severity;
  /** Required rule identifiers */
  requires?: string[];
  /** Affected files (defaults to empty array) */
  files?: Array<IssueFile>;
}

/**
 * Manages collection and organization of dataset validation issues
 * Extends Map to provide issue-specific functionality with key-based access
 */
export class DatasetIssues extends Map<string, Issue> {
  /** Optional schema reference for issue metadata */
  schema?: GenericSchema;

  /**
   * Creates a new dataset issues collection
   * @param schema - Optional schema containing issue definitions
   */
  constructor(
    schema?: GenericSchema,
  ) {
    super();
    this.schema = schema ? schema : {};
  }

  /**
   * Adds a new issue or updates an existing one
   * If an issue with the same key exists, merges the file references
   * 
   * @param params - Issue parameters
   * @returns The added or updated issue
   */
  add({
    key,
    reason,
    severity = "error",
    requires = [],
    files = [],
  }: DatasetIssuesAddParams): Issue {
    const existingIssue = this.get(key);
    if (existingIssue) {
      for (const f of files) {
        existingIssue.files.set(f.path, f);
      }
      return existingIssue;
    } else {
      const newIssue = new Issue({
        key,
        severity,
        reason,
        requires,
        files,
      });
      this.set(key, newIssue);
      return newIssue;
    }
  }

  /**
   * Checks if a specific issue exists
   * @param key - Issue identifier to check
   * @returns True if the issue exists
   */
  hasIssue({ key }: { key: string }): boolean {
    if (this.has(key)) {
      return true;
    }
    return false;
  }

  /**
   * Adds an issue using metadata from the schema
   * Retrieves issue details from schema's error definitions
   * 
   * @param key - Schema error key
   * @param files - Array of affected files
   */
  addSchemaIssue(key: string, files: Array<IssueFile>) {
    if (this.schema) {
      this.add({
        key: this.schema[`rules.errors.${key}.code`] as string,
        reason: this.schema[`rules.errors.${key}.reason`] as string,
        severity: this
          .schema[`rules.errors.${key}.level`] as string as Severity,
        requires: this.schema[`rules.errors.${key}.requires`] as string[],
        files: files,
      });
    }
  }

  /**
   * Finds all issues affecting a specific file
   * @param path - File path to check
   * @returns Array of issues affecting the file
   */
  fileInIssues(path: string): Issue[] {
    const matchingIssues = [];
    for (const [_, issue] of this) {
      if (issue.files.get(path)) {
        matchingIssues.push(issue);
      }
    }
    return matchingIssues;
  }

  /**
   * Gets issue keys for issues affecting a file
   * @param path - File path relative to dataset root
   * @returns Array of issue keys
   */
  getFileIssueKeys(path: string): string[] {
    return this.fileInIssues(path).map((issue) => issue.key);
  }

  /**
   * Removes issues for objects that weren't found
   * Filters based on rule satisfaction record
   * 
   * @param rulesRecord - Record of which rules were satisfied
   */
  filterIssues(rulesRecord: Record<string, boolean>) {
    for (const [_, issue] of this) {
      if (!issue.requires.every((req) => rulesRecord[req])) {
        this.delete(_);
      }
    }
  }

  /**
   * Formats issues for output
   * Converts internal representation to standardized output format
   * Separates issues by severity (errors vs warnings)
   * 
   * @returns Formatted issues object with separate error and warning arrays
   */
  formatOutput(): FullTestIssuesReturn {
    const output: FullTestIssuesReturn = {
      errors: [],
      warnings: [],
    };

    for (const [_, issue] of this) {
      const outputIssue: IssueOutput = {
        severity: issue.severity,
        key: issue.key,
        code: CODE_DEPRECATED,
        additionalFileCount: 0,
        reason: issue.reason,
        files: Array.from(issue.files.values()).map((f) => issueFile(issue, f)),
        helpUrl: issue.helpUrl,
      };

      if (issue.severity === "warning") {
        output.warnings.push(outputIssue);
      } else {
        output.errors.push(outputIssue);
      }
    }
    
    return output;
  }
}